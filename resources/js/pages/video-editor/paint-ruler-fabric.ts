import { FabricText, Line } from 'fabric';
import type { StaticCanvas } from 'fabric';

const NO_INTERACTION = { selectable: false, evented: false } as const;

export function syncRulerFabricCanvas(
    fabric: StaticCanvas,
    opts: {
        cssWidth: number;
        cssHeight: number;
        zoomLevel: number;
        formatTime: (t: number) => string;
    },
): void {
    const { cssWidth, cssHeight, zoomLevel, formatTime } = opts;

    if (fabric.getWidth() !== cssWidth || fabric.getHeight() !== cssHeight) {
        fabric.setDimensions({ width: cssWidth, height: cssHeight });
    }

    fabric.clear();

    const majorStep = zoomLevel * 50;
    const minorStep = zoomLevel * 10;

    if (minorStep <= 0 || majorStep <= 0) {
        fabric.renderAll();

        return;
    }

    const objs = [];

    for (let i = 0; ; i++) {
        const x = i * minorStep;

        if (x > cssWidth) {
            break;
        }

        if (i % 5 === 0) {
            continue;
        }

        objs.push(
            new Line([Math.floor(x), 2, Math.floor(x), 8], {
                stroke: '#444',
                strokeWidth: 1,
                ...NO_INTERACTION,
            }),
        );
    }

    for (let j = 0; ; j++) {
        const x = j * majorStep;

        if (x > cssWidth) {
            break;
        }

        objs.push(
            new Line([Math.floor(x), 2, Math.floor(x), 25], {
                stroke: '#444',
                strokeWidth: 1,
                ...NO_INTERACTION,
            }),
        );
        objs.push(
            new FabricText(formatTime(j * 5), {
                left: Math.floor(x) + 8,
                top: 12,
                fontSize: 12,
                fontFamily: 'Arial',
                fill: '#888',
                originX: 'left',
                originY: 'top',
                ...NO_INTERACTION,
            }),
        );
    }

    fabric.add(...objs);
    fabric.renderAll();
}
