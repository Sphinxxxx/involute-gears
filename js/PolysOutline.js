import { Flatbush } from 'vendor/mourner.js';
import * as geom from 'gear/geometry.js';


class CoordsAsValueTypes {
    constructor() {
        this._map = new Map();
    }

    get(coord) {
        const [x, y] = coord,
        xs = this._map;

        if (!xs.has(x)) { xs.set(x, new Map()); }
        const ys = xs.get(x);
        if (!ys.has(y)) { ys.set(y, coord); }
        return ys.get(y);
    }

    toArray() {
        const coords = [];
        for (const [x, ys] of this._map) {
            for (const [y, coord] of ys) {
                coords.push(coord);
            }
        }
        return coords;
    }
}

class CoordConnections {
    constructor() {
        this._map = new Map();
    }

    addSeg(seg) {
        const map = this._map;
        for (const coord of seg) {
            if (map.has(coord)) {
                map.get(coord).push(seg);
            }
            else {
                map.set(coord, [seg]);
            }
        }
    }

    getSegs(coord) {
        return this._map.get(coord) || [];
    }
}

function logSeg(seg) {
    return JSON.stringify( seg.map(coord => coord.map(xy => xy.toFixed(3))) );
}


class PolysOutline {
    constructor(polylines) {
        if (polylines) {
            this.init(polylines);
            this.buildIndexes();
        }
    }

    init(polylines, segFilter) {
        this.coords = new CoordsAsValueTypes();

        const allSegs = polylines.flatMap(poly => this.createSegments(poly, segFilter));
        this.segments = allSegs;
    }

    buildIndexes() {
        const segs = this.segments;

        //https://github.com/mourner/flatbush
        const index = new Flatbush(segs.length),
              connections = new CoordConnections();
        for (const seg of segs) {
            const rect = this.createRect(seg);
            //console.log('index2', logSeg(seg), rect);
            index.add(...rect);
            connections.addSeg(seg);
        }
        index.finish();
        this.segsIndex = index;
        this.connections = connections;
    }

    trace(startCoord) {
        const that = this,
              traced = new Set();
        function traceIt(coord, tag) {
            if (traced.has(coord)) { return false; }

            traced.add(coord);
            return true;
            //console.log('tr', traced.length, JSON.stringify(coord), tag);
        }

        function findOutermostSeg(fromSeg, candidates) {
            function findNextCoord(seg) {
                return seg[1];
            }
            function isInOuterSemicircle(coord) {
                return !geom.clockwise(...fromSeg, coord);
            }

            //Find all segments which continue where `fromSeg` ends:
            const nextStartCoord = findNextCoord(fromSeg),
                  nextSegs = candidates || that.getDirectedSegs(nextStartCoord, fromSeg);
            //console.log('nxt', nextSegs);
            if(!nextSegs.length) { return null; }

            const candidatesInOuterSemicircle = [];
            for (const seg of nextSegs) {
                //Arrange the potential segments so they point in the direction of the traced outline:
                if (seg[0] !== nextStartCoord) { seg.reverse(); }

                if (isInOuterSemicircle(seg[1])) {
                    candidatesInOuterSemicircle.push(seg);
                }
            }
            const candidateSegs = candidatesInOuterSemicircle.length
                    ? candidatesInOuterSemicircle
                    : nextSegs;

            //We trace the outline clockwise, so the next segment to trace is the most counter-clockwise as seen from `fromSeg`:
            let outerSeg = candidateSegs[0],
                outerCoord = findNextCoord(outerSeg);
            for (let i = 1; i < candidateSegs.length; i++) {
                const testSeg = candidateSegs[i],
                      testCoord = findNextCoord(testSeg);
                if (!geom.clockwise(nextStartCoord, outerCoord, testCoord)) {
                    outerSeg = testSeg;
                    outerCoord = testCoord;
                }
            }
            return outerSeg;
        }

        const prevCross = {
            crossedFromSeg: null,
            crossedAtT: -1,
        };
        function findFirstCrosser(curr) {
            let minT = 2, currT, crosserT, crosserSeg;
            for (const seg of that.getOverlapping(curr)) {
                //console.log('cx1', curr, -1, logSeg(seg));
                if (seg === prevCross.crossedFromSeg) { continue; }

                const ts = geom.intersectSegsAtT(curr, seg);
                if (ts === false) { continue; }

                currT = ts[0];
                if (currT < prevCross.crossedAtT) { continue; }

                //console.log('cx1', curr, currT, logSeg(seg), 'x');
                if (currT < minT) {
                    minT = currT;
                    crosserT = ts[1];
                    crosserSeg = seg;
                }
            }

            if (crosserSeg) {
                const crossPoint = geom.pointAtT(curr, minT);
                traceIt(crossPoint/*, `Cross between ${curr} and ${crosserSeg}`*/);
                //visitedX = maxX;
                //console.log('cx22', curr, minT, logSeg(crosserSeg), crossPoint);

                //Only follow crossroads that take us along the outline. Reverse the segment if needed:
                if (geom.clockwise(...curr, crosserSeg[1])) {
                    crosserSeg.reverse();
                    crosserT = 1 - crosserT;
                }
                prevCross.crossedFromSeg = curr;
                prevCross.crossedAtT = crosserT;
            }
            else {
                prevCross.crossedFromSeg = null;
                prevCross.crossedAtT = -1;
            }

            return crosserSeg;
        }


        traceIt(startCoord, 'Start');
        //For the first segment, pick only among those that go downwards (positive Y direction):
        const [startX, startY] = startCoord,
              normStart = this.coords.get(startCoord),
              startCandidates = this.getDirectedSegs(normStart).filter(seg => seg[1][1] > startY);
        let currSeg = findOutermostSeg(
            [[startX, startY - 10], normStart],
            startCandidates
        );
        //console.log('po', startCoord, currSeg, startCandidates);

        while (currSeg) {
            const crosser = findFirstCrosser(currSeg);
            if (crosser) {
                currSeg = crosser;
                continue;
            }

            const coord = currSeg[1];
            if (!traceIt(coord/*, `End of ${currSeg}`*/)) {
                break;
            }

            currSeg = findOutermostSeg(currSeg);
        }
        //console.log('rr', traced);

        return Array.from(traced);
    }

    createSegments(polyline, segFilter) {
        if (polyline.length < 2) { return []; }

        const coords = this.coords,
        segs = [];

        let from = coords.get(polyline[0]);
        for (let i = 1; i < polyline.length; i++) {
            const to = coords.get(polyline[i]),
                  seg = [from, to];
            if (!segFilter || segFilter(seg)) {
                segs.push(seg);
            }
            from = to;
        }
        return segs;
    }

    createRect(seg) {
        let [[minX, minY], [maxX, maxY]] = seg;
        if (minX > maxX) { [minX, maxX] = [maxX, minX]; }
        if (minY > maxY) { [minY, maxY] = [maxY, minY]; }

        return [minX, minY, maxX, maxY];
    }

    getDirectedSegs(fromCoord, exceptSeg) {
        const segs = this.connections.getSegs(fromCoord).filter(seg => seg !== exceptSeg);
        for (const seg of segs) {
            if (seg[0] !== fromCoord) { seg.reverse(); }
        }
        return segs;
    }

    getOverlapping(seg) {
        const allSegs = this.segments,
        iSeg = allSegs.indexOf(seg);
        //console.log('go', iSeg, allSegs.length);

        function countsAsOverlap(i) {
            if (i === iSeg) { return false; }

            const candidate = allSegs[i];
            //Connected segments don't count as overlaps:
            if (candidate.some(coord => seg.includes(coord))) { return false; };

            return true;
        }

        const overlaps = this.segsIndex
                .search(...this.createRect(seg), countsAsOverlap)
                .map(i => allSegs[i]);

        //if (overlaps.length) { console.log('over', seg, overlaps); }
        return overlaps;
    }
}

export default PolysOutline;
