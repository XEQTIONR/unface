import { Head } from '@inertiajs/react';
import { Pause, Play, Triangle, Users, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { create } from '@/routes/videos';
import { cn } from '@/lib/utils';

const PX_PER_SECOND = 10;

export default function VideoEditor() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const isScrubbingRef = useRef(false);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [videoLength, setVideoLength] = useState(0);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [metaLoaded, setMetaLoaded] = useState(false);

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
                <div className="flex w-full flex-col gap-5 overflow-x-auto rounded-xl px-4 md:px-16">
                    <video
                        ref={videoRef}
                        preload="metadata"
                        className={cn("relative z-10 w-full rounded-xl border border-neutral-300 object-cover", metaLoaded ? 'hidden' : '')}
                        src="https://stream.mux.com/BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM/highest.mp4"
                        onLoadedMetadata={(e) => {
                            console.log(e.currentTarget.videoWidth, e.currentTarget.videoHeight);
                            setDuration(e.currentTarget.duration);
                            setVideoLength(e.currentTarget.duration);
                            setDimensions({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight });
                            setMetaLoaded(true);
                        }}
                        onPlay={(e) => {
                            setIsPlaying(true)
                            const ctx = canvasRef.current?.getContext('2d');
                            function step() {
                                if (videoRef.current?.paused || videoRef.current?.ended) {
                                    return
                                }

                                ctx?.drawImage(videoRef.current, 0, 0, dimensions.width, dimensions.height);
                                requestAnimationFrame(step);
                            }
                              requestAnimationFrame(step);
                        }}
                        onPause={() => setIsPlaying(false)}
                        onTimeUpdate={(e) => {
                            if (isScrubbingRef.current) {
                                return;
                            }

                            setCurrentTime(e.currentTarget.currentTime);
                        }}
                    />
                    <canvas className={cn(
                        'border border-amber-400',
                        metaLoaded ? 'block' : 'hidden'
                    )} ref={canvasRef} width={dimensions.width} height={dimensions.height} />

                    <div className="w-full flex flex-col gap-5 pt-5">
                        <div className="flex justify-between">
                            <h1 className="font-extrabold tracking-widest uppercase">Global Timeline</h1>
                            <div className="flex items-center gap-2">
                                <Button onClick={() => setZoomLevel(zoomLevel + 0.1)} variant="ghost" size="icon">
                                    <ZoomIn />
                                </Button>
                                <Button onClick={() => setZoomLevel(Math.max(1, zoomLevel - 0.1))} variant="ghost" size="icon">
                                    <ZoomOut />
                                </Button>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div
                                ref={timelineRef}
                                className="relative w-full cursor-col-resize touch-none select-none pt-3"
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
                                <div className="relative h-36 w-full overflow-visible pb-5">
                                    <div
                                        id="seeker-line"
                                        className={
                                            'pointer-events-none absolute -top-3 bottom-0 z-1 -mr-px w-px overflow-visible bg-neutral-300 ' +
                                            (isScrubbing ? '' : 'transition-all duration-250 ease-linear')
                                        }
                                        style={{
                                            left: `${currentTime * PX_PER_SECOND * zoomLevel}px`,
                                        }}
                                    >
                                        <Triangle
                                            size={15}
                                            className="relative -left-[7px] -top-1 rotate-180 fill-white stroke-0 text-neutral-300"
                                        />
                                    </div>
                                    <div className="relative flex h-full w-full flex-col gap-1.5 bg-neutral-900 pb-5">
                                        <div
                                            className="h-5 w-full transition-all duration-250 ease-linear"
                                            style={{
                                                backgroundColor: 'transparent',
                                                backgroundImage: `
                                            linear-gradient(90deg, #888 1px, transparent 1px),
                                            linear-gradient(90deg, #666 1px, transparent 1px)
                                        `,
                                                backgroundSize: `${zoomLevel * 50}px 13px, ${zoomLevel * 10}px 5px`,
                                                backgroundRepeat: 'repeat-x',
                                                backgroundPosition: '0 top',
                                            }}
                                        />

                                        <div className="flex h-3/5 mt-3 w-full items-stretch gap-1">
                                            <div 
                                                className="flex items-center rounded border-x border-neutral-300 bg-neutral-700/65 px-3 text-xs font-bold uppercase transition-discrete duration-250 ease-linear"
                                                style={{ width: `${videoLength * PX_PER_SECOND * zoomLevel}px` }}
                                            >
                                                Clip_01
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="relative z-10 flex items-center gap-2">
                                <Button
                                    onClick={() =>
                                        isPlaying ? videoRef.current?.pause() : videoRef.current?.play()
                                    }
                                    variant="secondary"
                                    size="icon"
                                >
                                    {isPlaying ? <Pause /> : <Play />}
                                </Button>
                                <span className="text-sm font-bold">{formatTime(currentTime)}</span>
                            </div>
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
