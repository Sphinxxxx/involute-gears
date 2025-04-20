import * as geom from 'gear/geometry.js';
import * as utils from 'gear/tooth-utils.js';
//import GearTooth from 'gear/GearTooth.js';
import PinionGear from 'gear/PinionGear.js';
import InternalToothSegsFilter from 'gear/InternalToothSegsFilter.js';


class InternalGear {
    constructor(config) {
        this.config = config;
        this.debug = {
            segments: [],
        };

        const t = config.tooth,
              pitch = t.circularPitch,
              circum = config.teeth * pitch;
        this.r = circum / (2 * Math.PI);
        this.toothRotation = 360 / config.teeth; //utils.toothRotation(this.r, pitch);

        const pinTooth = utils.configForCutter(t);

        this._pin = new PinionGear({
            tooth: pinTooth,
            teeth: config.teethPinion,
            sampleDegs: config.sampleDegs,
        });

        this.realAddendum = this._pin._rack.realAddendum;
        this.realDedendum = this._pin._rack.realDedendum;
        this.innerR = this.r - this.realAddendum;
        this.outerR = this.r + this.realDedendum;

        //The "world" when building gears is centered on the pinion:
        this.worldX = (this._pin.r - this.r);
        //console.log('ig', this);
    }


    pinionToWorld(coord, pinionDegs) {
        const worldCoord = geom.rotate(0, 0, ...coord, -pinionDegs);
        return worldCoord;
    }

    worldToInternal(coord, internalDegs) {
        const internalCoord = geom.rotate(0, 0, coord[0] - this.worldX, coord[1], internalDegs);
        return internalCoord;
    }

    pinionToInternalDegs(pinionDegs) {
        return (this._pin.r / this.r) * pinionDegs;
    }

    ringTooth() {
        //Gear coupling or spline shaft (or invalid gear..)
        if(this.config.teeth <= this._pin.config.teeth) { return this.ringCutter(); }

        const { cutters, pointPaths, tipPath, undercutPath } = this.ringCutters(true);
        const innerR = this.innerR; //(this.gearR - this.tooth.dedendum);


        //Cutting an internal tooth results in a lot more polyline segments than when cutting a pinion tooth.
        //But the internal tooth always has a more even outline with straight-ish uncomplicated flanks,
        //so we can do some initial filtering on all those segments to speed up the tracing:
        const sm1 = Date.now();
        const segsFilter = new InternalToothSegsFilter([...cutters, ...pointPaths], innerR),
              tracer = segsFilter.tracer;
        //console.log('segs1', tracer.segments.length);

        //Start by removing segments above the tip and undercut paths.
        //Those paths usually follow the bottom of the outline, and we can remove a lot of unneeded segments:
        segsFilter.deleteAbove(tracer.createSegments(tipPath));
        segsFilter.deleteAbove(tracer.createSegments(undercutPath));
        //console.log('segs2', tracer.segments.length);

        //Takes longer...
        //  //Then brute-force remove the rest of unneeded segments:
        //  segsFilter.deleteAbove(tracer.segments);

        //this.debug.segments = tracer.segments;
        const sm2 = Date.now();
        //console.log('segs3', tracer.segments.length, sm2 - sm1);


        //Filtering is done. Trace the outline:
        tracer.buildIndexes();
        const traced = tracer.trace(segsFilter.startCoord);
        let outline = utils.smoothOutline(traced, this.config);

        //Trim the outline either at addendum or halfway to the next tooth:
        //Cut the outline *just before* it reaches the region of the next tooth,
        //to avoid duplicate points when rotating the outline to draw the whole gear.
        const maxAngle = this.toothRotation * .499;
        outline = utils.trimOutline(outline, innerR, maxAngle, true);

        //Putting it all together..
        const otherHalf = outline.map(geom.flipY).reverse();
        return otherHalf.concat(outline);
    }

    ringCutter() {
        const pinTooth = this._pin.pinionTooth(true);
        return pinTooth.outline; //.map(geom.flipX).reverse();
    }

    ringCutters(bothHalves) {
        const detail = this.config.sampleDegs,
                //Extra check for 2-tooth pinions or other configs that never really clear the ring:
                nextToothCutoff = geom.createVector(-this.toothRotation / 2, this.r * 2);

        //We'll make the ring tooth profile by sampling the pinion tooth at different angles,
        //puttimg all those polygons on top of each other, and then tracing the outline around them.
        const placeCut = (pinion, angle) => {
            const worldShape = pinion.map(c => this.pinionToWorld(c, angle)),
                  gearCutter = worldShape.map(c => this.worldToInternal(c, this.pinionToInternalDegs(angle)));
            return gearCutter;
        };

        const cutters = [],
              tipPath = [],
              undercutPath = [],
              pinionTooth = this.ringCutter();

        const tipIndex = this._pin.tipIndex,
              undercutIndex = -1; //this._pin.undercutIndex;

        let maxA = 0;
        for (let a = 0; a < 180 + detail; a += detail) {
            const cutter = placeCut(pinionTooth, a),
                  gearImprint = this.trimRingCutter(cutter, nextToothCutoff);

            //Usually, the finished ring tooth's outline will closely follow the path of the pinion's tip and undercut.
            //Log those paths for some initial filtering later:
            tipPath.push(cutter[tipIndex]);
            if(undercutIndex >= 0) {
                const uc1 = geom.flipY(cutter[undercutIndex]),
                      uc2 = cutter[cutter.length - 1 - undercutIndex];
                undercutPath.unshift(uc1);
                undercutPath.push(uc2);
            }

            maxA = a;
            if (!gearImprint.length) {
                break;
            }
            cutters.push(gearImprint);

            //For invalid gears, just return the base cut..
            if(this.config.teeth <= this._pin.config.teeth) { break; }
        }

        //The above gives us a fair, albeit jagged outline. To smooth out most of the jaggedness,
        //we add polygons for how each tooth *vertex* moves through the ring:
        const pointPaths = [];
        for (const vertex of pinionTooth) {
            const poly = [];
            for (let a = (bothHalves ? -maxA : 0); a <= maxA; a += detail) {
                const worldCoord = this.pinionToWorld(vertex, a),
                      internalCoord = this.worldToInternal(worldCoord, this.pinionToInternalDegs(a));
                poly.push(internalCoord);
            }
            const imprint = this.trimRingCutter(poly, nextToothCutoff);
            if(imprint.length) {
                pointPaths.push(imprint);
            }
        }

        //For our ringTooth() tracing algorithm, we need mirrored cutters for the whole profile:
        if (bothHalves) {
            const otherHalf = cutters.slice(1).map(poly => poly.map(geom.flipY));
            cutters.push(...otherHalf);
        }

        //console.log('gc', cuts.map(poly => poly.length));
        return {
            cutters,
            tipPath,
            undercutPath: this.trimRingCutter(undercutPath, nextToothCutoff),
            pointPaths,
        };
    }

    trimRingCutter(poly, nextToothCutoff) {
        const innerR = this.innerR; //(this.gearR - this.tooth.dedendum);
        function isIn(coord) {
            return (
                geom.clockwise(...nextToothCutoff, coord) &&
                (Math.hypot(...coord) >= innerR)
            );
        }

        let firstIn = -1, lastIn;
        for(let i = 0; i < poly.length; i++) {
            if(isIn(poly[i])) {
                firstIn = i;
                break;
            }
        }
        if(firstIn < 0) { return []; }

        for(let i = poly.length - 1; i >= 0; i--) {
            if(isIn(poly[i])) {
                lastIn = i;
                break;
            }
        }

        const firstKeeper = (firstIn > 0) ? firstIn - 1 : 0,
              trimmed = poly.slice(firstKeeper, lastIn + 2);
        return trimmed;
    }

    completeOutline() {
        const tooth = this.ringTooth(),
              gear = utils.completeOutline(tooth, this.config.teeth);
        return gear;
    }

    bevelOutline() {
        const beveled = new InternalGear(utils.bevelConfig(this.config));
        return beveled.completeOutline();
    }
}

export default InternalGear;