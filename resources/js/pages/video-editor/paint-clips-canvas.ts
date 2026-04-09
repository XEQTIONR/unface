import type { Clip, IdentityFrame } from '@/types/video'
import { characterTimeRangesFromFrames } from './character-time-ranges'
import { PX_PER_SECOND } from './constants'

export const CLIP_TRACK = {
    trackBg: 'rgba(64, 64, 64, 0.65)',
    clipBody: 'rgb(41, 37, 36)',
    charRowBg: 'rgba(34, 197, 94, 0.12)',
    charSegment: 'rgba(236, 72, 153, 0.45)',
    recording: 'rgb(239, 68, 68)',
    text: 'rgba(255, 255, 255, 0.95)',
    spinner: 'rgba(255, 255, 255, 0.85)',
} as const

const CLIP_GAP_PX = 2
const CHAR_ROW_H = 40
const TITLE_TOP = 6
const TITLE_SIZE = 11
const SPINNER_AREA_H = 44
const SECTION_GAP = 8
const RECORDING_TRIM_PX = PX_PER_SECOND / 5
const MIN_TRACK_H = 80
const CORNER_R = 4

function clipColumnHeight(hasRanges: boolean, rangeCount: number): number {
    const titleBlock = TITLE_TOP + TITLE_SIZE + 4

    if (!hasRanges) {
        return Math.max(MIN_TRACK_H, titleBlock + SPINNER_AREA_H)
    }

    return Math.max(MIN_TRACK_H, titleBlock + SECTION_GAP + rangeCount * CHAR_ROW_H)
}

function clipWidthPx(clip: Clip, pxPerSec: number): number {
    const end = clip.end ?? clip.start

    return Math.max(0, (end - clip.start) * pxPerSec)
}

function fillRoundedRect(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    r: number,
    fill: string,
) {
    ctx.fillStyle = fill

    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath()
        ctx.roundRect(bx, by, bw, bh, r)
        ctx.fill()
    } else {
        ctx.fillRect(bx, by, bw, bh)
    }
}

export function paintVideoClipsTrack(
    canvas: HTMLCanvasElement,
    frames: readonly IdentityFrame[],
    opts: {
        clips: Clip[]
        zoomLevel: number
        videoLengthSec: number
        isPlaying: boolean
        detect: boolean
        /** Video `currentTime` when painting (recording head). */
        liveVideoTimeSec: number
        /** Start time of active recording segment when `detect && isPlaying`. */
        recordingStartSec: number
        spinnerAngleRad: number
    },
): void {
    const pxPerSec = PX_PER_SECOND * opts.zoomLevel
    const trackW = Math.max(1, opts.videoLengthSec * pxPerSec)

    const perClipLayout = opts.clips.map((clip) => {
        const ranges =
            clip.end != null
                ? characterTimeRangesFromFrames([...frames], clip.start, clip.end)
                : []
        const w = clipWidthPx(clip, pxPerSec)
        const h = clipColumnHeight(ranges.length > 0, ranges.length)

        return { clip, ranges, w, h }
    })

    let cssH = perClipLayout.length
        ? Math.max(MIN_TRACK_H, ...perClipLayout.map((l) => l.h))
        : MIN_TRACK_H

    if (opts.isPlaying && opts.detect) {
        cssH = Math.max(cssH, MIN_TRACK_H)
    }

    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.max(1, Math.floor(trackW * dpr))
    canvas.height = Math.max(1, Math.floor(cssH * dpr))
    canvas.style.width = `${trackW}px`
    canvas.style.height = `${cssH}px`

    const ctx = canvas.getContext('2d')

    if (!ctx) {
        return
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, trackW, cssH)

    ctx.fillStyle = CLIP_TRACK.trackBg
    ctx.fillRect(0, 0, trackW, cssH)

    let x = 0

    for (const { clip, ranges, w, h } of perClipLayout) {
        if (w <= 0) {
            continue
        }

        const colH = Math.min(h, cssH)

        fillRoundedRect(ctx, x, 0, w, colH, CORNER_R, CLIP_TRACK.clipBody)

        ctx.fillStyle = CLIP_TRACK.text
        ctx.font = `bold ${TITLE_SIZE}px Arial`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(clip.name.toUpperCase(), x + 6, TITLE_TOP)

        if (ranges.length === 0) {
            const cx = x + w / 2
            const cy = TITLE_TOP + TITLE_SIZE + SPINNER_AREA_H / 2
            const r = 10
            ctx.strokeStyle = CLIP_TRACK.spinner
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(cx, cy, r, opts.spinnerAngleRad, opts.spinnerAngleRad + Math.PI * 1.45)
            ctx.stroke()
        } else {
            let ry = TITLE_TOP + TITLE_SIZE + SECTION_GAP

            for (const { name, ranges: charRanges } of ranges) {
                ctx.fillStyle = CLIP_TRACK.charRowBg
                ctx.fillRect(x + 4, ry, w - 8, CHAR_ROW_H - 4)

                for (const { start, end } of charRanges) {
                    const segStart = Math.max(clip.start, start)
                    const segEnd = Math.max(segStart, Math.min(clip.end ?? segStart, end ?? segStart))
                    const segW = (segEnd - segStart) * pxPerSec
                    const segX = x + (segStart - clip.start) * pxPerSec

                    if (segW > 0) {
                        ctx.fillStyle = CLIP_TRACK.charSegment
                        ctx.fillRect(segX, ry + 2, segW, CHAR_ROW_H - 8)
                    }
                }

                ctx.fillStyle = CLIP_TRACK.text
                ctx.font = '11px Arial'
                ctx.fillText(name, x + 8, ry + 10)

                ry += CHAR_ROW_H
            }
        }

        x += w + CLIP_GAP_PX
    }

    if (opts.isPlaying && opts.detect) {
        const recW = Math.max(
            0,
            (opts.liveVideoTimeSec - opts.recordingStartSec) * pxPerSec - RECORDING_TRIM_PX,
        )
        ctx.fillStyle = CLIP_TRACK.recording
        ctx.fillRect(x, 0, recW, cssH)
    }
}
