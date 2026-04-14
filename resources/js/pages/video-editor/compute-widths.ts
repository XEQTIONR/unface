import { PX_PER_FRAME, PX_PER_SECOND } from './constants'
import { TIMELINE_RIGHT_MARGIN_PX } from './constants'
export function computeTimelineContentWidthPx(opts: {
    durationSec: number
    currentTime: number
    viewportCssWidth: number
    zoomLevel: number
}): number {
    const pxPerSec = PX_PER_SECOND * opts.zoomLevel

    return Math.max(
        opts.durationSec * pxPerSec,
        opts.currentTime * pxPerSec + TIMELINE_RIGHT_MARGIN_PX,
        opts.viewportCssWidth,
    )
}

/** Horizontal offset (px) from the start of the timeline content (after the face gutter) to the playhead. */
export function playheadOffsetInTimelineContentPx(opts: {
    showFrames: boolean
    frameCount: number
    currentTimeSec: number
    zoomLevel: number
    durationSec: number
}): number {
    const { showFrames, frameCount, currentTimeSec, zoomLevel, durationSec } = opts
    const frameStripPx = frameCount * PX_PER_FRAME

    if (showFrames && frameStripPx > 0 && durationSec > 1e-9) {
        return (currentTimeSec / durationSec) * frameStripPx
    }

    return currentTimeSec * PX_PER_SECOND * zoomLevel
}