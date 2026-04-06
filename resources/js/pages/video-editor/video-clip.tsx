import { LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { IdentityFrame } from "@/types/video"
import type { Clip, CharacterTimeRange } from "@/types/video"
import { PX_PER_SECOND } from "./constants"

export default function VideoClip({ 
    clip, 
    zoomLevel, 
    framesRef, 
    ...props 
}: { 
    clip: Clip
    zoomLevel: number
    framesRef: React.RefObject<IdentityFrame[]> 
} & React.ComponentProps<"div">) {

    //const frames = framesRef.current.filter(({ time }) => time >= clip.start && time <= (clip.end || -1))

    const [timeRanges, setTimeRanges] = useState<CharacterTimeRange[]>([])
    const [status, setStatus] = useState<'initializing' | 'processing' | 'ready'>(clip.status)

    useEffect(() => {
        const f = framesRef.current.filter(({ time }) => time >= clip.start && time <= (clip.end || -1))
        const chars: CharacterTimeRange[] = []

        f.forEach(({ boxes, time }, index) => {
            boxes.forEach(({ name }) => {
                const i = chars.findIndex(({ name: charName }) => charName === name)

                if (i === -1) { // new character
                    chars.push({ name, ranges: [{ start: time }], lastFrame: index })
                } else { // existing character
                    if (chars[i].lastFrame === (index - 1)) { // last frame was the previous frame
                        chars[i].ranges[chars[i].ranges.length - 1].end = time
                    } else {
                        chars[i].ranges.push({ start: time })
                    }

                    chars[i].lastFrame = index
                }
            })
        })

        const fn = (() => {
            setTimeRanges(chars)

            if (status === 'processing') {
                setStatus('ready')
            }
        })

        fn()

    }, [framesRef, clip.end, clip.start, status])
    
    return (
        <div
            {...props}
            className={cn(
                "h-full  rounded",
                clip.status === 'processing' ? 'bg-stone-800' : 'bg-green-500'
            )} 
            style={{ 
                width: `${((clip.end || 0) - clip.start) * PX_PER_SECOND * zoomLevel}px`
            }}
        >
            <span className="text-2xs uppercase font-bold tracking-wider">{clip.name}</span>
            {
                status === 'processing' && (
                    <LoaderCircle className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                )
            }
            {
                status === 'ready' && (
                    <div className="w-full flex flex-col gap-2 my-2">
                        {timeRanges.map(({ name, ranges }) => (
                            <div
                                key={name}
                                className="bg-green-500/10 text-xs h-10 flex relative" 
                                style={{ width: `${((clip.end || 0) - clip.start) * PX_PER_SECOND * zoomLevel}px` }}
                            >
                                {ranges.map(({ start, end }) => (
                                    <div key={start} className="bg-pink-500/30 text-xs h-10 overflow-x-visible absolute top-0"
                                        style={{ 
                                            width: `${((end || 0) - start) * PX_PER_SECOND * zoomLevel}px`, 
                                            left: `${(start - clip.start) * PX_PER_SECOND * zoomLevel}px`
                                        }}
                                    >
                                        
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )
            }
        </div>
    )
}