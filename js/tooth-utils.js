import * as mourner from 'vendor/mourner.js';
import * as geom from 'gear/geometry.js';

export function configForCutter(toothConfig) {
    /* {
        circularPitch: 16,
        pressureAngle: 20,
        addendum: 5,
        profileShift: 0,
        clearance: 0,
        backlash: 0,
        undercut: true,
    } */
    const cutterConfig = structuredClone(toothConfig);

    //Circular pitch, pressure angle and addendum are values that need to be equal for meshing gears, and are in theory everything you need.
    //What we need to adjust are the real-world details of profileShift, clearance and backlash:

    //Clearance (at the bottom) is made by extending the tooth top of the cutter.
    //We fake that with a larger addendum, in addition to negative clearance (to keep the cutter's dedendum the same).
    if (toothConfig.clearance) {
        cutterConfig.addendum += toothConfig.clearance;
        cutterConfig.clearance = -toothConfig.clearance;
    }
    //Profile shift in one direction is made by moving the cutter in the opposite direction:
    if (toothConfig.profileShift) {
        cutterConfig.profileShift = -toothConfig.profileShift;
    }
    //Backlash (i.e. a thinner tooth) is made by fattening the cutter:
    if (toothConfig.backlash) {
        cutterConfig.backlash = -toothConfig.backlash;
    }


    return cutterConfig;
}

export function bevelConfig(config) {
    const bevelConf = structuredClone(config),
          t = bevelConf.tooth,
          bev = t.bevel;
    if (bev === undefined) {
        throw new Error("No `tooth.bevel` parameter");
    }

    t.profileShift -= bev;
    t.backlash += 3 * bev;

    //console.log('bc', config, bevelConf);
    return bevelConf;
}

//export function toothRotation(radius, circularPitch) {
//    const rotationArc = circularPitch,
//    angle = 180 * rotationArc / (Math.PI * radius);
//    return angle;
//}

export function trimOutline(outline, circleR, vectorDegs, movesClockwise) {
    //Trim the outline either at a circle (usually addendum/dedendum)
    //or when it crosses a vector (usually halfway to the next tooth).

    const outsideOfCircle = Math.hypot(...outline[0]) > circleR;
    function movedPastCircle(coord) {
        const r = Math.hypot(...coord);
        return outsideOfCircle ? (r < circleR) : (r > circleR);
    }

    //Make a vector that will cut the outline:
    const cutVector = geom.createVector(vectorDegs, circleR);
    //console.log('to-cut', cutVector);

    let prevCoord = outline[0],
        halfwayAt = -1,
        halfwayCoord = null;
    for (let i = 1; i < outline.length; i++) {
        let coord = outline[i];

        const moreThanHalfway = (geom.clockwise(...cutVector, coord) === movesClockwise);
        if(moreThanHalfway) {
            //Keep invalid undercuts on pinions - only remove the tooth tips:
            //
            //  coord = outline[i] = geom.intersectLines(cutVector, [prevCoord, coord]);
            //  outline = outline.slice(0, i + 1);
            //
            if (halfwayAt < 0) {
                halfwayAt = i;
                halfwayCoord = geom.intersectLines(cutVector, [prevCoord, coord]);
            }
        }
        else {
            halfwayAt = -1;
        }

        if (movedPastCircle(coord)) {
            const crossing = geom.intersectCircle([prevCoord, coord], circleR);
            outline[i] = crossing;
            outline = outline.slice(0, i + 1);
        }

        prevCoord = coord;
    }

    if ((halfwayAt > 0) && !movedPastCircle(halfwayCoord)) {
        outline = outline.slice(0, halfwayAt + 1);
        outline[halfwayAt] = halfwayCoord;
    }

    return outline;
}

export function smoothOutline(outline, config) {
    //Smooth just a little bit to remove redundant vertexes and
    //small dents which can be a side effect of high detail levels:
    const tolerance = config.tooth.addendum * (config.sampleDegs / 500),
          smooth = mourner.simplify(outline, tolerance, true);
    //console.log('smooth', [outline.length, smooth.length], tolerance, config);
    return smooth;
}

export function completeOutline(toothOutline, teeth) {
    const gear = [],
          rotation = 360 / teeth;
    for (let i = 0; i < teeth; i++) {
        const angle = -rotation * i,
              outline = toothOutline.map(coord => geom.rotate(0, 0, ...coord, angle));
        gear.push(...outline);
    }
    return gear;
}
