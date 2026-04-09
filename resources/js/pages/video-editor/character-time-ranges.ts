import type { CharacterTimeRange, IdentityFrame } from '@/types/video'

/** Build contiguous on-timeline segments per character from identity frames (same logic as the old VideoClip UI). */
export function characterTimeRangesFromFrames(
    frames: IdentityFrame[],
    clipStart: number,
    clipEnd: number | undefined,
): CharacterTimeRange[] {
    const f = frames.filter(({ time }) => time >= clipStart && time <= (clipEnd ?? -1))
    const chars: CharacterTimeRange[] = []

    f.forEach(({ boxes, time }, index) => {
        for (const { name } of boxes) {
            const i = chars.findIndex(({ name: charName }) => charName === name)

            if (i === -1) {
                chars.push({ name, ranges: [{ start: time }], lastFrame: index })
            } else {
                if (chars[i].lastFrame === index - 1) {
                    chars[i].ranges[chars[i].ranges.length - 1].end = time
                } else {
                    chars[i].ranges.push({ start: time })
                }

                chars[i].lastFrame = index
            }
        }
    })

    return chars
}
