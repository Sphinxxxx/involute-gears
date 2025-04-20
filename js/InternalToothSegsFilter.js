import * as mourner from 'vendor/mourner.js';
import PolysOutline from 'gear/PolysOutline.js';


class InternalToothSegsFilter {
    constructor(polylines, innerRadius) {
        const rSq = innerRadius * innerRadius;
        function partOfBottomHalfTooth(seg) {
            const [[x1, y1], [x2, y2]] = seg;
            if (y1 < 0 && y2 < 0) { return false; }

            const hyp1 = (x1 * x1) + (y1 * y1),
                  hyp2 = (x2 * x2) + (y2 * y2);
            return ((hyp1 >= rSq) || (hyp2 >= rSq));
        }
        const tracer = new PolysOutline();
        tracer.init(polylines, partOfBottomHalfTooth);

        //https://github.com/mourner/kdbush
        const coordsList = tracer.coords.toArray(),
              index = new mourner.KDBush(coordsList.length);
        let minY = 0,
            maxX = 0, startCoord;
        for (const coord of coordsList) {
            const [x, y] = coord;

            index.add(x, y);
            if (y < minY) { minY = y; }

            //The tooth is traced from the bottom right corner:
            if ((y > 0) && (x > maxX)) {
                maxX = x;
                startCoord = coord;
            }
        }
        index.finish();

        this.tracer = tracer;
        this.coordsList = coordsList;
        this.coordsIndex = index;
        this.minY = minY;
        this.startCoord = startCoord;
    }

    deleteAbove(segs) {
        const coordsList = this.coordsList,
              coordsIndex = this.coordsIndex;

        //Go through each segment. Any segment above it (negative Y direction)
        //will not be part of the outline:
        const markedForDeletion = new Set(),
        minY = this.minY;
        for (const [from, to] of segs) {
            const maxY = Math.min(from[1], to[1]);

            let x1 = from[0], x2 = to[0];
            if (x1 > x2) { [x1, x2] = [x2, x1]; }

            const notOutlineCoords = coordsIndex.range(x1, minY, x2, maxY)
                                                .map(i => coordsList[i]);
            for (const coord of notOutlineCoords) {
                if ((coord === from) || (coord === to)) { continue; }
                markedForDeletion.add(coord);
            }
        }

        function keepSegment(seg) {
            const discard = (markedForDeletion.has(seg[0]) && markedForDeletion.has(seg[1]));
            return !discard;
        }
        this.tracer.segments = this.tracer.segments.filter(keepSegment);
            //.filter(([from, to]) => !(markedForDeletion.has(from) && markedForDeletion.has(to)));
    }

}

export default InternalToothSegsFilter;
