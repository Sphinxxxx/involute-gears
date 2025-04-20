import * as geom from 'gear/geometry.js';


class RackGear {
    constructor(tooth) {
        this.tooth = tooth;

        //this._add = tooth.addendumRatio * tooth.circularPitch,
        //this._shift = tooth.profileShift * tooth.circularPitch,
        //this._clear = tooth.clearanceRatio * tooth.circularPitch;
        //this._lash = tooth.backlashRatio * tooth.circularPitch;

        //this.pinionAddendum = this._add + this._shift;
        //this.pinionDedendum = this._add - this._shift + this._clear;

        //this.pinionAddendum = tooth.addendum + tooth.profileShift;
        //this.pinionDedendum = tooth.addendum - tooth.profileShift + tooth.clearance;
        this.realAddendum = tooth.addendum + tooth.profileShift;
        this.realDedendum = tooth.addendum + tooth.clearance - tooth.profileShift;
    }

    rackTooth(offsetY = 0) {
        const t = this.tooth,
              w = t.circularPitch / 2,
              rads = geom.deg2rad(t.pressureAngle),
              add = t.addendum,
              clear = t.clearance,
              ded = add + clear,
              backlashPerFlank = t.backlash / 4;;

        const riseOverRun = Math.sin(rads) / Math.cos(rads),
              addRise = add * riseOverRun,
              dedRise = ded * riseOverRun,
              run = 2 * add + clear,
              rise = run * riseOverRun;

        const x1 = -ded + t.profileShift,
              y1 = -(w / 2) - dedRise + backlashPerFlank,
              x2 = x1 + run,
              y2 = y1 + rise;

        const base1 = [x1, y1 + offsetY],
              tip1 = [x2, y2 + offsetY],
              tip2 = [x2, -y2 + offsetY],
              base2 = [x1, -y1 + offsetY];

        let polygon, topLand;
        //Flat tooth:
        if (tip1[1] < tip2[1]) {
            polygon = [base1, tip1, tip2, base2];
            topLand = [tip1, tip2];
        }
        //Pointy tooth:
        else {
            const singleTip = geom.intersectLines([base1, tip1], [base2, tip2]);
            polygon = [base1, singleTip, base2];
            topLand = [singleTip];
        }

        //console.log('rack', offsetY, poly);
        return {
            polygon,
            topLand,
        };
    }

    completeOutline(teeth = 5, offsetY = 0) {
        const poly = [];
        for (let i = 0; i < teeth; i++) {
            const tooth = this.rackTooth(i * this.tooth.circularPitch + offsetY);
            poly.push(...tooth.polygon);
        }
        return poly;
    }
}

export default RackGear;