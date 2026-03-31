import { Head } from '@inertiajs/react';
import { Triangle, Users } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { create } from '@/routes/video';

const PX_PER_SECOND = 10;

export default function VideoEditor() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const isScrubbingRef = useRef(false);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isScrubbing, setIsScrubbing] = useState(false);

    const setTimeFromClientX = useCallback((clientX: number) => {
        const timeline = timelineRef.current;
        const video = videoRef.current;

        if (!timeline || !video) {
            return;
        }

        const rect = timeline.getBoundingClientRect();
        const x = clientX - rect.left;
        const raw = x / PX_PER_SECOND;
        const maxTime =
            Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : duration > 0
                  ? duration
                  : undefined;
        const t =
            maxTime != null && maxTime > 0 ? Math.max(0, Math.min(raw, maxTime)) : Math.max(0, raw);

        video.currentTime = t;
        setCurrentTime(t);
    }, [duration]);

    const formatTime = (time: number) => {
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const seconds = time % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(0).toString().padStart(2, '0')}`;
    };

    return (
        <>
            <Head title="Video Editor" />
            <div className="flex flex-col">
                <div className="flex w-full flex-col gap-4 overflow-x-auto rounded-xl px-4 md:px-16">
                    <video
                        ref={videoRef}
                        controls
                        className="w-full aspect-video rounded-xl border border-neutral-300 object-cover"
                        src="https://stream.mux.com/BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM/highest.mp4"
                        onLoadedMetadata={(e) => {
                            setDuration(e.currentTarget.duration);
                        }}
                        onTimeUpdate={(e) => {
                            if (isScrubbingRef.current) {
                                return;
                            }

                            setCurrentTime(e.currentTarget.currentTime);
                        }}
                    />
                    <div className="w-full flex flex-col gap-5">
                        <h1 className="font-extrabold tracking-widest uppercase">Global Timeline</h1>
                        <div
                            ref={timelineRef}
                            className="relative h-40 w-full cursor-col-resize touch-none select-none"
                            onPointerDown={(e) => {
                                e.preventDefault();
                                isScrubbingRef.current = true;
                                setIsScrubbing(true);
                                e.currentTarget.setPointerCapture(e.pointerId);
                                setTimeFromClientX(e.clientX);
                            }}
                            onPointerMove={(e) => {
                                if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
                                    return;
                                }

                                setTimeFromClientX(e.clientX);
                            }}
                            onPointerUp={(e) => {
                                e.currentTarget.releasePointerCapture(e.pointerId);
                                isScrubbingRef.current = false;
                                setIsScrubbing(false);
                            }}
                            onPointerCancel={(e) => {
                                e.currentTarget.releasePointerCapture(e.pointerId);
                                isScrubbingRef.current = false;
                                setIsScrubbing(false);
                            }}
                        >
                            <div
                                id="seeker-line"
                                className={
                                    'absolute -top-3 z-10 -mr-px h-30 w-px overflow-visible bg-neutral-300 ' +
                                    (isScrubbing ? '' : 'transition-all duration-250 ease-linear')
                                }
                                style={{
                                    left: currentTime * PX_PER_SECOND + 'px',
                                }}
                            >
                                <Triangle size={15} className="relative -left-[7px] -top-1 fill-white stroke-0 text-neutral-300 rotate-180" />
                            </div>
                            <div className='w-full pb-5 bg-neutral-900 flex flex-col gap-1.5 relative h-24 overflow-y-visible'>
                                <div 
                                    className="w-full h-5"
                                    style={{
                                        backgroundColor: "transparent",
                                        backgroundImage: `
                                            linear-gradient(90deg, #888 1px, transparent 1px),
                                            linear-gradient(90deg, #666 1px, transparent 1px)
                                        `,
                                        backgroundSize: "50px 20px, 10px 10px", /* Width and Height of each tick layer */
                                        backgroundRepeat: "repeat-x",
                                        backgroundPosition: "0 top"
                                    }}
                                >

                                </div>
                                <div className='w-full h-12 flex items-stretch gap-1'>
                                    <div className="w-44 bg-neutral-700/65 rounded border-x border-neutral-300 uppercase flex items-center px-3 text-xs font-bold">
                                        CLIP_01
                                    </div>
                                    <div className="w-25 bg-neutral-700/65 rounded border-x border-neutral-300" />
                                </div>
                            </div>
                            <span className="text-sm font-bold">{formatTime(currentTime)}</span>
                        </div>
                        
                        
                    </div>
                </div>
                <div className="grid grid-cols-2 items-start gap-5 w-full h-24 p-4 md:p-16 mb-60">
                    <div className='bg-neutral-800/50 flex  gap-2 items-center justify-center py-6 px-6 rounded'>
                        <div className='w-2/3  p-5'>
                            <h3 className=" font-extrabold uppercase">Face Tracking</h3>
                            <span className="text-sm font-medium text-muted-foreground">Track faces live in the video</span>
                        </div>
                        <div className='flex w-1/3 gap-3 justify-center'>
                            <div className='rounded-lg bg-neutral-800 flex flex-col gap-2 items-center justify-center size-20 aspect-square'>
                                <Users size={20} />
                                <span className='text-xs font-bold uppercase'>Remove</span>
                            </div>
                            <div className='rounded-lg bg-neutral-800 flex flex-col gap-2 items-center justify-center size-20 aspect-square'>
                                <Users size={20} />
                                <span className='text-xs font-bold uppercase'>Sticker</span>
                            </div>
                        </div>
                    </div>
                    <div className='bg-neutral-800/50 flex flex-col gap-2 justify-center px-8 py-8 rounded'>
                        
                        <h3 className="font-extrabold uppercase">Sticker Library</h3>
                        <div className='flex gap-3 mt-4'>
                            <div className='rounded-lg bg-neutral-800 flex flex-col gap-2 items-center justify-center size-16 aspect-square'>
                                <Users />
                            </div>
                            <div className='rounded-lg bg-neutral-800 flex flex-col gap-2 items-center justify-center size-16 aspect-square'>
                                <Users />
                            </div>
                            <div className='rounded-lg bg-neutral-800 flex flex-col gap-2 items-center justify-center size-16 aspect-square'>
                                <Users />
                            </div>
                        </div>
                        
                        
                    </div>
                </div>
            </div>
            
        </>
    );
}

VideoEditor.layout = {
    breadcrumbs: [
        {
            title: 'Editor',
            href: create(),
        },
    ],
};
