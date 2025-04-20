//export function lerp(v0, v1, t) {
//    if(Array.isArray(v0)) {
//        return v0.map((v, i) => lerp(v, v1[i], t));
//    }
//    //Precise method, which guarantees v = v1 when t = 1.
//    //https://en.wikipedia.org/wiki/Linear_interpolation#Programming_language_support
//    return ((1-t) * v0) + (t * v1);
//}

//export function coordEqual(a, b) {
//    return (a[0] === b[0] && a[1] === b[1]);
//}

export function flipX(coord) {
    return [-coord[0], coord[1]];
}

export function flipY(coord) {
    return [coord[0], -coord[1]];
}

export function deg2rad(degs) {
    return Math.PI * degs / 180;
}

export function createVector(degs, length) {
    const rads = deg2rad(degs),
            vector = [
                [0, 0],
                [Math.cos(rads) * length, Math.sin(rads) * length]
            ];
    return vector;
}

//https://stackoverflow.com/a/17411276/1869660
export function rotate(cx, cy, x, y, angle) {
    const radians = deg2rad(angle);
    return rotateRad(cx, cy, x, y, radians);
}
export function rotateRad(cx, cy, x, y, radians) {
    const cos = Math.cos(radians),
          sin = Math.sin(radians),
          nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
          ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
    return [nx, ny];
}

export function pointAtT(seg, t) {
    const [[x1, y1], [x2, y2]] = seg,
          x = x1 + t * (x2 - x1),
          y = y1 + t * (y2 - y1);
    return [x, y];
}

const INTERSECT_EPSILON = 1e-9;
// line intercept math by Paul Bourke http://paulbourke.net/geometry/pointlineplane/
// Determine the intersection point of two line segments
// Return FALSE if the lines don't intersect
export function intersectLinesAtT(lineA, lineB, epsilon = INTERSECT_EPSILON) {
    const [[x1, y1], [x2, y2]] = lineA,
          [[x3, y3], [x4, y4]] = lineB;

    const denominator = ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
    if (denominator === 0) {
        // Lines are parallel
        return false;
    }

    const ta = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator,
          tb = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator;
    return [ta, tb];
}
export function intersectLines(lineA, lineB, epsilon = INTERSECT_EPSILON) {
    const ts = intersectLinesAtT(lineA, lineB, epsilon);
    if (!ts) { return false; }

    // Return a object with the x and y coordinates of the intersection
    return pointAtT(lineA, ts[0]);
}
export function intersectSegsAtT(segmentA, segmentB, epsilon = INTERSECT_EPSILON) {
    const ts = intersectLinesAtT(segmentA, segmentB, epsilon);
    if (!ts) { return false; }

    // is the intersection along the segments
    const outsideSegment = (t) => ((t < -epsilon) || (t > 1 + epsilon));
    if (outsideSegment(ts[0]) || outsideSegment(ts[1])) {
        return false;
    }
    return ts;
}
export function intersectSegs(segmentA, segmentB, epsilon = INTERSECT_EPSILON) {
    const ts = intersectSegsAtT(segmentA, segmentB, epsilon);
    if (!ts) { return false; }

    // Return a object with the x and y coordinates of the intersection
    return pointAtT(segmentA, ts[0]);
}

export function intersectCircle(segment, circleR, epsilon = INTERSECT_EPSILON) {
    //https://math.stackexchange.com/a/2862/148688
    //
    //  tx1 + (1−t)x2 = x
    //  ty1 + (1−t)y2 = y
    //  x² + y² = r²
    //
    //  (tx1 + (1−t)x2)² + (ty1 + (1−t)y2)² = r²
    //
    //  Solve for t:  At² + Bt + C = 0
    //      A = x1² − 2x1x2 + x2²  +  y1² − 2y1y2 + y2²
    //      B = 2x1x2 − 2x2²  +  2y1y2 − 2y2²
    //      C = x2² + y2² − r²
    //
    const [[x1, y1], [x2, y2]] = segment, r = circleR,
            A = x1**2 - 2*x1*x2 +   x2**2  +  y1**2 - 2*y1*y2 +   y2**2,
            B =         2*x1*x2 - 2*x2**2  +          2*y1*y2 - 2*y2**2,
            C =                     x2**2  +                      y2**2  -  r**2;

    //Use the quadratic formula:
    //
    //      −B ± √(B² − 4AC)
    //  t = −−−−−−−−−−−−−−−−
    //             2A
    //
    const bac = B**2 - 4*A*C;
    if (bac < 0) { return false; }
    const bacRoot = Math.sqrt(bac);

    const outsideSegment = (t) => ((t < -epsilon) || (t > 1 + epsilon));

    let t = (-B - bacRoot) / (2*A);
    if (outsideSegment(t)) {
        t = (-B + bacRoot) / (2*A);
        if (outsideSegment(t)) { return false; }
    }

    const x = t*x1 + (1-t)*x2,
            y = t*y1 + (1-t)*y2;
    return [x, y];
}

//https://algorithmtutor.com/Computational-Geometry/Determining-if-two-consecutive-segments-turn-left-or-right/
export function clockwise(a, b, c) {
    function vector(from, to) {
        return [to[0] - from[0], to[1] - from[1]];
    }

    // Calculates the cross product of vectors v1 and v2:
    //  - If v2 is clockwise from v1 wrt origin then it returns +ve value.
    //  - If v2 is anti-clockwise from v1 wrt origin then it returns -ve value.
    //  - If v2 and v1 are collinear then it returns 0.
    function cross_product(v1, v2) {
        return v1[0] * v2[1] - v2[0] * v1[1];
    }

    const v1 = vector(a, b),
            v2 = vector(a, c),
            cross = cross_product(v1, v2);

    return (cross > 0);
}
