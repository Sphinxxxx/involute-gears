import * as geom from 'gear/geometry.js';
import * as utils from 'gear/tooth-utils.js';
//import GearTooth from 'gear/GearTooth.js';
import RackGear from 'gear/RackGear.js';
import PolysOutline from 'gear/PolysOutline.js';


class PinionGear {
    constructor(config) {
        this.config = config;

        const t = config.tooth,
              pitch = t.circularPitch,
              circum = config.teeth * pitch;
        this.r = circum / (2 * Math.PI);
        this.toothRotation = 360 / config.teeth; //utils.toothRotation(this.r, pitch);

        const rackTooth = utils.configForCutter(t);
        this._rack = new RackGear(rackTooth);

        //TODO?
        this.realAddendum = this._rack.realDedendum;
        this.realDedendum = this._rack.realAddendum;
        this.innerR = this.r - this.realDedendum;
        this.outerR = this.r + this.realAddendum;
    }


    rackOffset(pinionDegs) {
        const arcLength = geom.deg2rad(pinionDegs) * this.r;
        return -arcLength;
    }

    rackToWorld(coord) {
        const [x, y] = coord;
        return [x - this.r, y];
    }

    worldToPinion(coord, pinionDegs) {
        const pinionCoord = geom.rotate(0, 0, ...coord, pinionDegs);
        return pinionCoord;
    }

    pinionTooth(isRingCutter = false) {
        const {
            cuts,
            rackTopLands,
            rackTipPath,
        } = this.halfPinionCuts();

        const flatTopRack = (rackTopLands[0].length > 1);

        //See what kind of bottom we'll get, which decides where to start tracing later.
        //In most cases, the bottom-land of the pinion is a smooth curve (or even just a straight segment) shaped by the rack's top-land.
        //If so, we can start tracing the outline from the bottom-land center.
        //(The other option is that the rack tip carves the bottom into a cardioid-like shape with a sharp point in the middle, see below.)
        let traceFromBottomCenter = true,
            traceFromPoint;
        const [ bottom1, bottom2 ] = rackTopLands;
        if (bottom2 && flatTopRack) {
            const bottomCross = geom.intersectLines(bottom1, bottom2);
            traceFromBottomCenter = (bottomCross && (bottomCross[1] > 0));
        }

        if (traceFromBottomCenter) {
            traceFromPoint = flatTopRack ? geom.pointAtT(bottom1, .5) : bottom1[0];
            //The top flanks of the cuts will never be part of the outline(?),
            //so adjust the first cut's upper tip to give PolysOutline a valid point to start from:
            cuts[0][1] = traceFromPoint;
        }
        //If we have the sharp, cardioid-like bottom discussed above (small gears made even smaller by profile shift),
        //the entire bottom is carved by the rack's tip. To find the `rackTipPath` segment that starts carving the lower half,
        //we start from the middle of the path and search until it crosses y = 0:
        else {
            let i = Math.trunc(rackTipPath.length / 2);
            traceFromPoint = rackTipPath[i];
            while (i < (rackTipPath.length - 1)) {
                const nextTip = rackTipPath[i + 1];
                if (nextTip[1] < 0) { break; }

                traceFromPoint = nextTip;
                i++;
            }
        }

        //Duplicate the cuts to represent a complete outline
        //(making sure the duplicates turn in the same direction as the original cutters):
        const allCuts = [
            ...cuts.slice(1).map(poly => poly.map(geom.flipY).reverse()),
            ...cuts,
        ];
        //Trace the actual outline. The top flanks of the cutters will never be part of the outline:
        const polysForTracing = [...allCuts.map(poly => poly.slice(1)), rackTipPath],
              tracer = new PolysOutline(polysForTracing);
        let halfOutline = tracer.trace(traceFromPoint);
        if (traceFromBottomCenter) {
            //Normally, we can just skip the center point to avoid duplicate points when stitching together the complete outline.
            //But in a config with a lot of backlash, e.g. when cutting a bevel, we get a sharp bottom point which we need to keep.
            const [p1, p2] = halfOutline,
                dx = Math.abs(p2[0] - p1[0]),
                dy = Math.abs(p2[1] - p1[1]);
            //If the first step is mostly downward, just skip the center..
            if (dy > dx) {
                halfOutline = halfOutline.slice(1);
            }
            //..but if the first step moves sharply to the side, create an artificial point just below the center:
            else {
                halfOutline[0][1] = this.config.tooth.circularPitch / 1000;
            }
        }

        //Trim the involute where it crosses the addendum circle.
        //In case the involute is so curved that the tooth never reaches addendum,
        //cut it *just before* it reaches the region of the next tooth,
        //to avoid duplicate points when rotating the outline to draw the whole gear.
        const maxAngle = 180 - .499 * this.toothRotation;
        halfOutline = this.smoothOutline( utils.trimOutline(halfOutline, this.outerR, maxAngle, false) );

        this.tipIndex = halfOutline.length;
        //this.undercutIndex = -1;

        //Complete the outline. Right now, it's the gap between teeth that's pointing straight to the left.
        //Rotate to make a tooth pointing to the right:
        const horizontalHalf = halfOutline.map(c => geom.rotate(0, 0, ...c, -this.toothRotation/2));
        //In the case of an extra wide top-land, add a point to follow the addendum circle.
        //This doesn't work for some small ring cutters that get a bumpy top-land, probably related to InternalGear's initial filtering..
        if (!isRingCutter) {
            const halfTopWidth = -horizontalHalf[this.tipIndex - 1][1],
                topLandRads = 2 * halfTopWidth / this.outerR;
            if (topLandRads > .1) {
                const y = halfTopWidth / 3,
                    x = this.outerR * Math.cos(y / this.outerR);
                horizontalHalf.push([-x, -y]);
            }
        }
        const otherHalf = horizontalHalf.map(geom.flipY).reverse(),
              outline = horizontalHalf.concat(otherHalf).map(geom.flipX);

        //console.log('cuts u-i', traceUndercutBottom, traceUndercutSide, traceInvolute);
        return {
            cuts: allCuts,
            tipPath: rackTipPath,
            polysForTracing,
            parts: {
                halfOutline,
            },
            outline: outline,
        };
    }

    //The pinion is cut by a rack tooth:
    pinionCutter(angle) {
        const rotatePoly = (poly) => {
            const worldCoords = poly.map(coord => this.rackToWorld(coord)),
                  pinionCoords = worldCoords.map(coord => this.worldToPinion(coord, angle));
            return pinionCoords;
        };

        const cutter = this._rack.rackTooth(this.rackOffset(angle));
        return {
            polygon: rotatePoly(cutter.polygon),
            topLand: rotatePoly(cutter.topLand),
        };
    }

    halfPinionCuts() {
        const conf = this.config,
              detail = conf.sampleDegs,
              undercuts = conf.tooth.undercut;

        function lowerRackTip(rackTooth) {
            const top = rackTooth.topLand;
            if (top.length === 1) {
                //For cases where the addendum is so large that the rack tooth doesn't really have a top land, but only a single tip:
                return top[0];
            }
            else {
                return top[1];
            }
        }

        //Sample cuts at different angles to get the outline of a tooth:
        const baseCut = this.pinionCutter(0),
              cuts = [baseCut.polygon],
              rackTopLands = [baseCut.topLand],
              rackTipPath = [lowerRackTip(baseCut)];

        //By going all the way to 240 degrees, we can cut a (probably useless) 1-tooth gear:
        for (let a = detail; a <= 240; a += detail) {
            const cutter = this.pinionCutter(a),
                  innerTip = lowerRackTip(cutter),
                  r = Math.hypot(...innerTip);

            if (r > this.outerR) { break; }

            cuts.push(cutter.polygon);
            rackTopLands.push(cutter.topLand);
            rackTipPath.push(innerTip);
            rackTipPath.unshift(geom.flipY(cutter.topLand[0]));
        }

        return {
            cuts,
            rackTopLands,
            rackTipPath,
        };
    }

    smoothOutline(outline) {
        return utils.smoothOutline(outline, this.config);
    }

    completeOutline() {
        const tooth = this.pinionTooth(),
              gear = utils.completeOutline(tooth.outline, this.config.teeth);
        //const gear = [],
        //      c = this.config;
        //for (let i = 0; i < c.teeth; i++) {
        //    const tooth = this.pinionTooth(),
        //          angle = this.pinionToothRot * i,
        //          outline = tooth.outline.map(coord => geom.rotate(0, 0, ...coord, angle));
        //    gear.push(outline);
        //}
        return gear;
    }

    bevelOutline() {
        const beveled = new PinionGear(utils.bevelConfig(this.config));
        return beveled.completeOutline();
    }
}

export default PinionGear;