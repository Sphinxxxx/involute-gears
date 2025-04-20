import * as geom from 'gear/geometry.js';
import RackGear from 'gear/RackGear.js';
import PinionGear from 'gear/PinionGear.js';
import InternalGear from 'gear/InternalGear.js';


Vue.component('circlemarker', {
    template: `<circle v-if="coord" :r="r || 1" :fill="fill || 'transparent'" :cx="coord[0]" :cy="coord[1]">
                    <title>{{ coord }}</title>
                </circle>`,
    props: ['coord', 'r', 'fill'],
});

new Vue({
    el: '#app',
    data: {
        tooth: {
            circularPitch: 16,
            pressureAngle: 20,
            addendumRatio: .32, //Default: circularPitch / π
            profileShiftRatio: 0,
            clearanceRatio: 0,
            backlashRatio: 0,
            //undercut: true,
            bevelRatio: 0,
        },
        pinionTeeth: 16,
        pinionDegs: 0,
        ringTeeth: 34,
        detail: 2,
        view: {
            fixedPinion: false,
            debugging: false,
            zoomer: 1,
        },
    },
    computed: {
        circleDash() {
            return this.tooth.circularPitch * this.view.zoomer / 4;
        },
        toothConfig() {
            const t = this.tooth,
                  pitch = t.circularPitch,
                  add = t.addendumRatio * pitch;
            return {
                circularPitch: pitch,
                pressureAngle: t.pressureAngle,
                addendum: add,
                profileShift: t.profileShiftRatio * pitch, //add,
                clearance: t.clearanceRatio * pitch, //add,
                backlash: t.backlashRatio * pitch,
                bevel: t.bevelRatio * pitch,
            };
        },
        sampleDegrees() {
            const det = Math.min(Math.max(this.detail, -2), 6),
                degs = 2**(4 - det);
            console.log('sample', degs);
            return degs;
        },

        rack() {
            //*
            return new RackGear(this.invertProfileShift());
            /*/
            return this.pinion._rack;
            //*/
        },
        pinion() {
            //*
            return new PinionGear({
                tooth: this.toothConfig,
                teeth: this.pinionTeeth,
                sampleDegs: this.sampleDegrees,
            });
            /*/
            return this.ring._pin;
            //*/
        },
        /*
        pinionBevel() {
            return new PinionGear({
                tooth: this.bevelConfig(this.toothConfig),
                teeth: this.pinionTeeth,
                sampleDegs: this.sampleDegrees,
            });
        },
        */
        pinionBase() {
            return this.pinion.pinionBaseCircleR();
        },
        ring() {
            return new InternalGear({
                tooth: this.invertProfileShift(),
                teeth: this.ringTeeth,
                teethPinion: this.pinionTeeth,
                sampleDegs: this.sampleDegrees,
            });
        },
        /*
        ringBevel() {
            return new InternalGear({
                tooth: this.bevelConfig(this.invertProfileShift()),
                teeth: this.ringTeeth,
                teethPinion: this.pinionTeeth,
                sampleDegs: this.sampleDegrees,
            });
        },
        */

        pinionR() { return this.pinion.r; },
        ringR() { return this.ring.r; },
        ringX() { return this.ring.worldX; },
        ringDegs() { return this.ring.pinionToInternalDegs(this.pinionDegs); },

        transContainer() {
            return this.view.fixedPinion ? `rotate(${-this.pinionDegs})` : '';
        },
        transRack() {
            const y = this.pinion.rackOffset(this.pinionDegs);
            return `translate(${this.pinion.rackToWorld([0, y])})`;
        },
        transPinion() {
            return `rotate(${this.pinionDegs})`;
        },
        transRing() {
            return `translate(${this.ringX}) rotate(${this.ringDegs})`;
        },

        pinionToothProxy() {
            return this.pinion.pinionTooth();
        },
        ringCutterProxy() {
            return this.ring.ringCutter();
        },
        ringCuttersProxy() {
            return this.ring.ringCutters(true);
        },
        ringToothComp() {
            const a = Date.now();
            const tooth = this.ring.ringTooth();
            const b = Date.now();
            console.log('rtc', b - a);
            return tooth;
        },

        renderedRack() {
            let offsetTeeth = (this.pinionTeeth % 2) ? 2 : 2.5;
            return this.renderOutline(this.rack.completeOutline(5, -offsetTeeth * this.tooth.circularPitch));
        },
        renderedPinion() {
            return this.renderOutline(this.pinion.completeOutline());
        },
        renderedPinionBevel() {
            //return this.renderOutline(this.pinionBevel.completeOutline());
            return this.renderOutline(this.pinion.bevelOutline());
        },
        renderedRing() {
            return this.renderOutline(this.ring.completeOutline());
        },
        renderedRingBevel() {
            //return this.renderOutline(this.ringBevel.completeOutline());
            return this.renderOutline(this.ring.bevelOutline());
        },
    },
    mounted() {
        const that = this,
              svg = document.querySelector('#gears'),
            { width: w, height: h } = svg.getBoundingClientRect();

        const size = this.ringR * 2,
              vb = (w > h) ? [-size/2, -size/2, size * w/h, size]
                           : [-size/2, -size/2, size, size * h/w];
        svg.setAttribute('viewBox', vb);
        zoomableSvg(svg, {
            onChanged(a) {
                that.view.zoomer = this.getZoom();
            }
        });

        /* DEBUG: .pinion, .rack
        this.pinionTeeth = 30;
        this.ringTeeth = 60;
        this.tooth.profileShiftRatio = .21;
        this.tooth.backlashRatio = .63;
        //DEBUG */
    },
    methods: {
        invertProfileShift() {
            const tooth = structuredClone(this.toothConfig);
            //The profileShift setting is based off the pinion, so the rack and ring needs it inverted:
            tooth.profileShift = -tooth.profileShift;
            return tooth;
        },
        /*
        bevelConfig(toothConf) {
            const bev = this.tooth.circularPitch * this.bevelRatio;

            const bevelTooth = structuredClone(toothConf);
            bevelTooth.profileShift -= bev;
            bevelTooth.backlash += 3 * bev;

            return bevelTooth;
        },
        */
        rackTooth(offsetY = 0) {
            const t = this.rack.rackTooth(offsetY);
            //console.log('rt', offsetY, t);
            return t.polygon;
        },
        renderOutline(poly) {
            const decimals = 4 - Math.floor(Math.log10(this.tooth.circularPitch));
            function normNum(n) {
                let str = n.toFixed(decimals);
                str = str.replace(/0+$/, '').replace(/\.$/, '');
                return str;
            }
            const coords = poly.map(coord => coord.map(normNum));
            return `M${coords}Z`;
        }
    }
});
