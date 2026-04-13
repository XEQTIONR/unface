import { Circle, FabricText, Rect } from 'fabric';
import type { StaticCanvas } from 'fabric';
import type { Clip, IdentityFrame } from '@/types/video';
import { characterTimeRangesFromFrames } from './character-time-ranges';
import { PX_PER_SECOND } from './constants';

export const CLIP_TRACK = {
    trackBg: 'rgba(64, 64, 64, 0.65)',
    clipBody: 'rgb(41, 37, 36)',
    charRowBg: 'rgba(34, 197, 94, 0.12)',
    charSegment: 'rgba(236, 72, 153, 0.45)',
    recording: 'rgb(239, 68, 68)',
    text: 'rgba(255, 255, 255, 0.95)',
    spinner: 'rgba(255, 255, 255, 0.85)',
} as const;

const NO_INTERACTION = { selectable: false, evented: false } as const;

/** Fabric defaults origin to center; timeline layout is top-left based (matches display canvas). */
const TOP_LEFT = {
    originX: 'left' as const,
    originY: 'top' as const,
};

const CLIP_GAP_PX = 2;
/** Character / identity row height in the clips timeline (matches HTML face gutter rows). */
export const CLIP_CHAR_ROW_HEIGHT_PX = 60;
const CHAR_ROW_H = CLIP_CHAR_ROW_HEIGHT_PX;
const TITLE_TOP = 6;
const TITLE_SIZE = 11;
const SPINNER_AREA_H = 44;
const SECTION_GAP = 8;
/** Y offset from top of clips canvas to first character row (matches HTML face gutter). */
export const CLIP_FIRST_CHAR_ROW_TOP_PX = TITLE_TOP + TITLE_SIZE + SECTION_GAP;
const RECORDING_TRIM_PX = PX_PER_SECOND / 5;
const MIN_TRACK_H = 80;
const CORNER_R = 4;

function radToDeg(r: number): number {
    return (r * 180) / Math.PI;
}

function clipColumnHeight(hasRanges: boolean, rangeCount: number): number {
    const titleBlock = TITLE_TOP + TITLE_SIZE + 4;

    if (!hasRanges) {
        return Math.max(MIN_TRACK_H, titleBlock + SPINNER_AREA_H);
    }

    return Math.max(
        MIN_TRACK_H,
        titleBlock + SECTION_GAP + rangeCount * CHAR_ROW_H,
    );
}

function clipWidthPx(clip: Clip, pxPerSec: number): number {
    const end = clip.end ?? clip.start;

    return Math.max(0, (end - clip.start) * pxPerSec);
}

export function syncClipsFabricCanvas(
    fabric: StaticCanvas,
    frames: readonly IdentityFrame[],
    opts: {
        clips: Clip[]
        zoomLevel: number
        /** CSS width of the clip row (usually matches ruler / `timelineSpanPx`). */
        trackWidthPx: number
        isPlaying: boolean
        detect: boolean
        liveVideoTimeSec: number
        recordingStartSec: number
        spinnerAngleRad: number,
        showFrames?: boolean
    },
): void {
    const pxPerSec = PX_PER_SECOND * opts.zoomLevel;
    const trackW = Math.max(1, opts.trackWidthPx);

    const perClipLayout = opts.clips.map((clip) => {
        const ranges =
            clip.end != null
                ? characterTimeRangesFromFrames(
                      [...frames],
                      clip.start,
                      clip.end,
                  )
                : [];
        const w = clipWidthPx(clip, pxPerSec);
        const h = clipColumnHeight(ranges.length > 0, ranges.length);

        return { clip, ranges, w, h };
    });

    let cssH = perClipLayout.length
        ? Math.max(MIN_TRACK_H, ...perClipLayout.map((l) => l.h))
        : MIN_TRACK_H;

    if (opts.isPlaying && opts.detect) {
        cssH = Math.max(cssH, MIN_TRACK_H);
    }

    if (fabric.getWidth() !== trackW || fabric.getHeight() !== cssH) {
        fabric.setDimensions({ width: trackW, height: cssH });
    }

    fabric.clear();

    const objs = [];

    objs.push(
        new Rect({
            left: 0,
            top: 0,
            width: trackW,
            height: cssH,
            fill: CLIP_TRACK.trackBg,
            strokeWidth: 0,
            rx: 0,
            ry: 0,
            ...TOP_LEFT,
            ...NO_INTERACTION,
        }),
    );

    let x = 0;

    for (const { clip, ranges, w, h } of perClipLayout) {
        if (w <= 0) {
            continue;
        }

        const colH = Math.min(h, cssH);

        objs.push(
            new Rect({
                left: x,
                top: 0,
                width: w,
                height: colH,
                rx: CORNER_R,
                ry: CORNER_R,
                fill: CLIP_TRACK.clipBody,
                strokeWidth: 0,
                ...TOP_LEFT,
                ...NO_INTERACTION,
            }),
        );

        objs.push(
            new FabricText(clip.name.toUpperCase(), {
                left: x + 6,
                top: TITLE_TOP,
                fontSize: TITLE_SIZE,
                fontFamily: 'Arial',
                fontWeight: 'bold',
                fill: CLIP_TRACK.text,
                originX: 'left',
                originY: 'top',
                ...NO_INTERACTION,
            }),
        );

        if (ranges.length === 0) {
            const cx = x + w / 2;
            const cy = TITLE_TOP + TITLE_SIZE + SPINNER_AREA_H / 2;
            objs.push(
                new Circle({
                    left: cx,
                    top: cy,
                    originX: 'center',
                    originY: 'center',
                    radius: 10,
                    fill: 'transparent',
                    stroke: CLIP_TRACK.spinner,
                    strokeWidth: 2,
                    startAngle: radToDeg(opts.spinnerAngleRad),
                    endAngle: radToDeg(opts.spinnerAngleRad + Math.PI * 1.45),
                    ...NO_INTERACTION,
                }),
            );
        } else {
            let ry = TITLE_TOP + TITLE_SIZE + SECTION_GAP;

            for (const { name, ranges: charRanges } of ranges) {
                objs.push(
                    new Rect({
                        left: x + 4,
                        top: ry,
                        width: w - 8,
                        height: CHAR_ROW_H - 4,
                        fill: CLIP_TRACK.charRowBg,
                        strokeWidth: 0,
                        rx: 0,
                        ry: 0,
                        ...TOP_LEFT,
                        ...NO_INTERACTION,
                    }),
                );

                for (const { start, end } of charRanges) {
                    const segStart = Math.max(clip.start, start);
                    const segEnd = Math.max(
                        segStart,
                        Math.min(clip.end ?? segStart, end ?? segStart),
                    );
                    const segW = (segEnd - segStart) * pxPerSec;
                    const segX = x + (segStart - clip.start) * pxPerSec;

                    if (segW > 0) {
                        objs.push(
                            new Rect({
                                left: segX,
                                top: ry + 2,
                                width: segW,
                                height: CHAR_ROW_H - 8,
                                fill: CLIP_TRACK.charSegment,
                                strokeWidth: 0,
                                ...TOP_LEFT,
                                ...NO_INTERACTION,
                            }),
                        );
                    }
                }

                objs.push(
                    new FabricText(name, {
                        left: x + 8,
                        top: ry + 10,
                        fontSize: 11,
                        fontFamily: 'Arial',
                        fill: CLIP_TRACK.text,
                        originX: 'left',
                        originY: 'top',
                        ...NO_INTERACTION,
                    }),
                );

                ry += CHAR_ROW_H;
            }
        }

        x += w + CLIP_GAP_PX;
    }

    if (opts.isPlaying && opts.detect) {
        const recW = Math.max(
            0,
            (opts.liveVideoTimeSec - opts.recordingStartSec) * pxPerSec -
                RECORDING_TRIM_PX,
        );

        if (recW > 0) {
            objs.push(
                new Rect({
                    left: x,
                    top: 0,
                    width: recW,
                    height: cssH,
                    fill: CLIP_TRACK.recording,
                    strokeWidth: 0,
                    ...TOP_LEFT,
                    ...NO_INTERACTION,
                }),
            );
        }
    }

    fabric.add(...objs);
    fabric.renderAll();
}
