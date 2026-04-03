import { Head } from '@inertiajs/react';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs';
/** Maintained face-api.js–compatible API for TensorFlow.js 4.x (original `face-api.js` npm targets old TFJS). */
import * as faceapi from '@vladmandic/face-api';
// import { FaceApiDetection } from '@vladmandic/face-api';
import { Pause, Play, Triangle, Users, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn, hashToRange } from '@/lib/utils';
import { create } from '@/routes/videos';

const PX_PER_SECOND = 10;

/** How often to run face detection (ms). Lower = fresher boxes; slightly higher can help stability on slow GPUs. */
const DETECTION_INTERVAL_MS = 50;

/**
 * Longest side (px) fed into the detector when the video is larger than this.
 * Smaller sources use **native** resolution (no upscale).
 */
const MAX_DETECTION_LONG_SIDE = 720

const THRESHOLD = 12

/** SSD MobileNet v1 weights (same family as face-api.js). */
const FACE_API_MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

import type { FaceApiDetection, FaceBox, IdentityBox } from '@/types/video'


const removeNumberOne = (num: number) => {
    if (num === 1) {
        return ''
    }
    
    return '_' + num.toString()
}

export default function VideoEditor() {


const names = useRef([
    'Abagail',
    'Bailey',
    'Cameron',
    'Dakota',
    'Ethan',
    'Finn',
    'Grace',
    'Henry',
    'Isabella',
    'Jacob',
    'Kiara',
    'Liam',
    'Mary',
    'Natalie',
    'Oliver',
    'Paisley',
    'Quinn',
    'Ryan',
    'Samuel',
    'Trent',
    'Uma',
    'Victoria',
    'William',
    'Xavier',
    'Yasmine',
    'Zachary',
])


    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const timelineRef = useRef<HTMLDivElement>(null)
    const isScrubbingRef = useRef(false)

    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [videoLength, setVideoLength] = useState(0)
    const [isScrubbing, setIsScrubbing] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const [zoomLevel, setZoomLevel] = useState(1)
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
    const [metaLoaded, setMetaLoaded] = useState(false)

    const [faceApiReady, setFaceApiReady] = useState(false)
    const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const latestFacesRef = useRef<FaceBox[]>([])
    const [faces, setFaces] = useState<Set<string>>(new Set([]))
    const [currentFaces, setCurrentFaces] = useState<Set<string>>(new Set([]))
    const chars = useRef<IdentityBox[]>([])
    /** Detection box coords are in detection-canvas pixels (dw×dh), not full video pixels. */
    const lastDetectionDimsRef = useRef({ dw: 0, dh: 0 })

    useEffect(() => {
        detectionCanvasRef.current = document.createElement('canvas')

        return () => {
            detectionCanvasRef.current = null
        };
    }, []);

    const setTimeFromClientX = useCallback((clientX: number) => {
        const timeline = timelineRef.current
        const video = videoRef.current

        if (!timeline || !video) {
            return
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

    useEffect(() => {

        const v = videoRef.current;

        if (v) {
            v.crossOrigin = 'anonymous';
            v.load();
        }
        
        let cancelled = false;

        (async () => {
            try {
                // Prefer WebGL for faster inference; fall back to CPU if WebGL fails (e.g. tainted source).
                const ok =
                    (await tf.setBackend('webgl')) || (await tf.setBackend('cpu'));

                if (!ok || cancelled) {
                    return;
                }

                await tf.ready();

                if (cancelled) {
                    return;
                }

                await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_BASE);

                if (!cancelled) {
                    setFaceApiReady(true);
                }
            } catch (error) {
                console.error(error);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);


    useEffect(() => {
        if (!faceApiReady || !isPlaying) {
            return;
        }

        let cancelled = false;
        let rafId = 0;
        let lastDetectionAt = 0;
        let busy = false;

        const tick = (time: number) => {

            if (cancelled) {
                return;
            }

            rafId = requestAnimationFrame(tick);

            if (busy) {
                return;
            }

            const video = videoRef.current;
            const canvas = detectionCanvasRef.current;

            if (!video || !canvas || video.paused || video.ended) {
                return;
            }

            if (time - lastDetectionAt < DETECTION_INTERVAL_MS) {
                return;
            }

            const vw = video.videoWidth;
            const vh = video.videoHeight;

            if (!vw || !vh) {
                return;
            }

            const long = Math.max(vw, vh);
            const targetLong = Math.min(long, MAX_DETECTION_LONG_SIDE);
            const scale = long > 0 ? targetLong / long : 1;
            const dw = Math.max(1, Math.round(vw * scale));
            const dh = Math.max(1, Math.round(vh * scale));

            let input: HTMLVideoElement | HTMLCanvasElement = video;

            if (scale < 1 - 1e-6) {
                canvas.width = dw;
                canvas.height = dh;

                const ctx = canvas.getContext('2d', { willReadFrequently: false });

                if (!ctx) {
                    return;
                }

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(video, 0, 0, dw, dh);
                input = canvas;
                
            }

            lastDetectionAt = time;
            busy = true;

            void faceapi
                .detectAllFaces(
                    input,
                    new faceapi.SsdMobilenetv1Options({
                        minConfidence: 0.4,
                        maxResults: 20,
                    }),
                )
                .then((detections) => {
                    const fs: FaceBox[] = detections.map((d: FaceApiDetection) => ({
                        x: d.box.x,
                        y: d.box.y,
                        w: d.box.width,
                        h: d.box.height,
                    }));

                    latestFacesRef.current = fs
                    lastDetectionDimsRef.current = { dw, dh }

                    return detections
                })
                .catch((error: unknown) => {
                    console.error(error);
                })
                .finally(() => {
                    busy = false;
                });
        };

        rafId = requestAnimationFrame(tick);

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
        };
    }, [faceApiReady, isPlaying]);

    const onPlay = () => {
        setIsPlaying(true);
        const ctx = canvasRef.current?.getContext('2d');

        function step() {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (!video || !canvas || !ctx || video.paused || video.ended) {
                return;
            }

            const vw = video.videoWidth;
            const vh = video.videoHeight;

            if (!vw || !vh) {
                requestAnimationFrame(step);

                return;
            }

            const cw = canvas.width;
            const ch = canvas.height;

            if (!cw || !ch) {
                requestAnimationFrame(step);

                return;
            }

            ctx.drawImage(video, 0, 0, cw, ch);

            const { dw, dh } = lastDetectionDimsRef.current;
            const sx = dw > 0 ? cw / dw : cw / vw;
            const sy = dh > 0 ? ch / dh : ch / vh;

            ctx.strokeStyle = 'rgba(0, 255, 255, 0.95)';
            ctx.fillStyle = 'rgba(0, 255, 255, 0.95)';
            ctx.font = '60px Arial';
            ctx.lineWidth = Math.max(2, Math.round(cw / 400));
            ctx.setLineDash([]);
            
            let ns: IdentityBox[] = [...chars.current];
            const currentNames: string[] = []
            let comparedTo: IdentityBox[] = [...chars.current];
            
            if (latestFacesRef.current.length > 0) {
                for (const rect of latestFacesRef.current.sort((a, b) => a.x - b.x)) {
                    ctx.strokeRect(
                        rect.x * sx,
                        rect.y * sy,
                        rect.w * sx,
                        rect.h * sy,
                    );

                    if (chars.current.length === 0) { // no characters yet
                        const n = names.current[ns.length % names.current.length] + Math.floor(Math.random() * 1000)
                        ctx.fillText(n, rect.x * sx, rect.y * sy)
                        ns.push({
                            name: n,
                            x: rect.x,
                            y: rect.y,
                            w: rect.w,
                            h: rect.h
                        })

                        currentNames.push(n)
                        
                    } else { // compare with existing characters
                        const found = comparedTo.find(({x, y}) => ((x - rect.x) ** 2 + (y - rect.y) ** 2) < THRESHOLD ** 2)

                        if (found) {
                            ctx.fillText(found.name, rect.x * sx, rect.y * sy)
                            ns = ns.map((n) => {
                                if (n.name === found.name) {
                                    n.x = rect.x;
                                    n.y = rect.y;
                                    n.w = rect.w;
                                    n.h = rect.h;
                                }

                                return n
                            })
                            currentNames.push(found.name)
                            comparedTo = comparedTo.filter(({x, y, name}) => x !== found.x && y !== found.y && name !== found.name);
                        } else {
                            const n = names.current[ns.length % names.current.length] + Math.floor(Math.random() * 1000) 
                            ctx.fillText(n, rect.x * sx, rect.y * sy)
                            ns.push({
                                name: n,
                                x: rect.x,
                                y: rect.y,
                                w: rect.w,
                                h: rect.h
                            })
                            currentNames.push(n)
                        }
                    }
                }

                chars.current = ns
                const set = new Set(ns.map((n) => n.name))
                const set2 = new Set(currentNames)
                
                if (!(faces.isSubsetOf(set) && set.isSubsetOf(faces))) {
                    setFaces(set)
                }

                if (!(currentFaces.isSubsetOf(set2) && set2.isSubsetOf(currentFaces))) {
                    setCurrentFaces(set2)
                }
            } else {
                setCurrentFaces(new Set([]))
            }
                

            requestAnimationFrame(step)
        }

        requestAnimationFrame(step)
    }

    return (
        <>
            <Head title="Video Editor" />
            <div className="flex flex-col">
                <div className="flex w-full flex-col gap-5 overflow-x-auto rounded-xl px-4 md:px-16">
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-neutral-300">
                    <video
                        ref={videoRef}
                        crossOrigin="anonymous"
                        playsInline
                        preload="auto"
                        className={cn(
                            'h-full w-full object-cover',
                            metaLoaded
                                ? 'pointer-events-none absolute inset-0 z-0 opacity-0'
                                : 'relative z-0',
                        )}
                        // src="https://stream.mux.com/BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM/highest.mp4"
                        src="/multiple.mp4"
                        onLoadedMetadata={(e) => {
                            console.log('Loaded metadata', e.currentTarget.videoWidth, e.currentTarget.videoHeight);
                            setDuration(e.currentTarget.duration);
                            setVideoLength(e.currentTarget.duration);
                            setDimensions({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight });
                            setMetaLoaded(true);
                        }}
                        onPlay={() => onPlay()}
                        onPause={() => setIsPlaying(false)}
                        onTimeUpdate={(e) => {
                            if (isScrubbingRef.current) {
                                return;
                            }

                            setCurrentTime(e.currentTarget.currentTime);
                        }}
                    />
                    <canvas
                        className={cn(
                            'h-full w-full object-contain',
                            metaLoaded ? 'relative z-10 block' : 'hidden',
                        )}
                        ref={canvasRef}
                        width={dimensions.width}
                        height={dimensions.height}
                    />
                    </div>

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
                <div className="grid grid-cols-2 items-start gap-5 w-full p-4 md:p-16 mb-10">
                    <div className='bg-neutral-800/50 flex flex-col gap-2 py-6 px-6 rounded'>
                        <div className="w-full flex items-center justify-center">
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
                        <div className="flex flex-col gap-2 px-4 h-64 overflow-y-scroll">
                            {[...faces].sort().map((name) => (
                                <div key={name} className='flex items-center gap-5'>
                                    <span className={cn(
                                        "material-symbols-outlined px-2.5 py-2 rounded flex items-center justify-center text-4xl!",
                                        currentFaces.has(name) ? 'bg-teal-600' : "bg-neutral-600"
                                    )}>
                                        face{removeNumberOne(hashToRange(name, 6))}
                                    </span>
                                    <span className='text-sm font-medium text-muted-foreground'>{name}</span>
                                </div>
                            ))}
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
