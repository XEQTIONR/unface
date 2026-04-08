
import { Head } from '@inertiajs/react'
import '@tensorflow/tfjs-backend-cpu'
import '@tensorflow/tfjs-backend-webgl'
import * as tf from '@tensorflow/tfjs'
/** Maintained face-api.js–compatible API for TensorFlow.js 4.x (original `face-api.js` npm targets old TFJS). */
import * as faceapi from '@vladmandic/face-api'
import type { FaceDetection } from '@vladmandic/face-api'
import { Pause, Play, Triangle } from 'lucide-react'
import { useCallback, useRef, useState, useEffect } from 'react'
import type { SyntheticEvent } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import Dropzone from '@/components/dropzone'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { create } from '@/routes/videos'
import type { FaceBox, IdentityBox, IdentityFrame } from '@/types/video'
import type { Clip } from '@/types/video'
import { 
    DETECTION_INTERVAL_MS, 
    FACE_API_MODEL_BASE, 
    PX_PER_SECOND, 
    MAX_DETECTION_LONG_SIDE, 
    MOVEMENT_THRESHOLD, 
    names as allNames, 
} from './video-editor/constants'
import VideoClip from './video-editor/video-clip'

export default function VideoEditor() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const chars = useRef<IdentityBox[]>([])
    const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const i = useRef(0)
    const idFramesRef = useRef<IdentityFrame[]>([])
    const isScrubbingRef = useRef(false)
    const lastDetectionDimsRef = useRef({ dw: 0, dh: 0 })
    const latestFacesRef = useRef<FaceBox[]>([])
    const names = useRef(allNames)
    const timelineRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const videoBlobUrlRef = useRef<string | undefined>(undefined)
    const videoContainerRef = useRef<HTMLDivElement>(null)

    const [currentFaces, setCurrentFaces] = useState<Set<string>>(new Set([]))
    const [currentTime, setCurrentTime] = useState(0)
    const [detect, setDetect] = useState(true)
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
    const [duration, setDuration] = useState(0)
    const [faceApiReady, setFaceApiReady] = useState(false)
    const [faces, setFaces] = useState<Set<string>>(new Set([]))
    const [isPlaying, setIsPlaying] = useState(false)
    const [isScrubbing, setIsScrubbing] = useState(false)
    const [metaLoaded, setMetaLoaded] = useState(false)
    const [videoLength, setVideoLength] = useState(0)
    const [zoomLevel, setZoomLevel] = useState(1)
    const [clips, setClips] = useState<Clip[]>([])
    const [currentClip, setCurrentClip] = useState<Clip | null>(null)
    const [videoFileUrl, setVideoFileUrl] = useState<string | undefined>(undefined)

    useEffect(() => {
        return () => {
            if (videoBlobUrlRef.current) {
                URL.revokeObjectURL(videoBlobUrlRef.current)
            }
        }
    }, [])
    
    useEffect(() => {
        detectionCanvasRef.current = document.createElement('canvas')

        return () => {
            detectionCanvasRef.current = null
        }
    }, [])

    useEffect(() => {

        const v = videoRef.current
        let cancelled = false

        if (v) {
            v.crossOrigin = 'anonymous'
            v.load()
        }
        
        (async () => {
            try {
                // Prefer WebGL for faster inference; fall back to CPU if WebGL fails (e.g. tainted source).
                const ok =
                    (await tf.setBackend('webgl')) || (await tf.setBackend('cpu'))

                if (!ok || cancelled) {
                    return
                }

                await tf.ready()

                if (cancelled) {
                    return
                }

                await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_BASE)

                if (!cancelled) {
                    setFaceApiReady(true)
                }
            } catch (error) {
                console.error(error)
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [])

    useEffect(() => {
        if (!faceApiReady || !isPlaying || !detect) {
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
                return
            }

            if (time - lastDetectionAt < DETECTION_INTERVAL_MS) {
                return
            }

            const vw = video.videoWidth;
            const vh = video.videoHeight;

            if (!vw || !vh) {
                return
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
                .then((detections: FaceDetection[]) => {
                    const fs: FaceBox[] = detections.map((d: FaceDetection) => ({
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
    }, [faceApiReady, isPlaying, detect])

    const formatTime = (time: number) => {
        const hours = Math.floor(time / 3600)
        const minutes = Math.floor((time % 3600) / 60)
        const seconds = time % 60

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(0).toString().padStart(2, '0')}`
    }
    
    const paintVideoToDisplayCanvas = useCallback(() => {
        const video = videoRef.current
        const canvas = canvasRef.current

        if (!video || !canvas) {
            return
        }

        const ctx = canvas.getContext('2d')

        if (!ctx) {
            return
        }

        const vw = video.videoWidth
        const vh = video.videoHeight

        if (!vw || !vh) {
            return
        }

        const cw = canvas.width
        const ch = canvas.height

        if (!cw || !ch) {
            return
        }

        ctx.drawImage(video, 0, 0, cw, ch)
    }, [])

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
                  : undefined
        const t =
            maxTime != null && maxTime > 0 ? Math.max(0, Math.min(raw, maxTime)) : Math.max(0, raw)

        video.currentTime = t
        
        setCurrentTime(t) // really important
    }, [duration])

    const calculateAndSetVideoDimensions = useCallback(() => {
        const video = videoRef.current as HTMLVideoElement

        if (!video) {
            return
        }

        const h = video.videoHeight
        const w = video.videoWidth
        const ratio = w/h

        const panel = document.querySelector('#resizable-video-panel') as HTMLDivElement
        const panelH = (panel.offsetHeight * 0.9) || 0

        const newW = panelH * ratio

        setDimensions({ width: newW, height: panelH })

        setTimeout(() => {
            paintVideoToDisplayCanvas()
        }, 100)
    }, [paintVideoToDisplayCanvas, videoRef])

    const onResize = useDebouncedCallback(calculateAndSetVideoDimensions, 50)

    const onVideoFileSelect = useCallback((file: File) => {
        if (videoBlobUrlRef.current) {
            URL.revokeObjectURL(videoBlobUrlRef.current)
        }

        const url = URL.createObjectURL(file)
        videoBlobUrlRef.current = url
        setVideoFileUrl(url)
    }, [])

    const onLoadedMetadata = (e: SyntheticEvent<HTMLVideoElement>)  => {
        calculateAndSetVideoDimensions()
        setDuration(e.currentTarget.duration)
        setVideoLength(e.currentTarget.duration)
        setMetaLoaded(true)
    }

    const canPlay = () => paintVideoToDisplayCanvas()

    const onPlay = () => {

        if (detect) {
            setCurrentClip({
                name: 'Clip ' + (clips.length + 1),
                start: videoRef.current?.currentTime || 0,
                status: 'initializing'
            })
        }

        setIsPlaying(true)
        const ctx = canvasRef.current?.getContext('2d')

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
            const currentNames: string[] = []

            if (detect) {
                let ns: IdentityBox[] = [...chars.current];
                const charsInFrame: IdentityBox[] = []
                
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
                            const name = names.current[ns.length % names.current.length] + Math.floor(Math.random() * 1000)
                            ctx.fillText(name, rect.x * sx, rect.y * sy)
                            const r = {
                                name: name,
                                x: rect.x,
                                y: rect.y,
                                w: rect.w,
                                h: rect.h
                            }
                            charsInFrame.push(r)
                            ns.push(r)
    
                            currentNames.push(name)
                            
                        } else { // compare with existing characters
                            const found = comparedTo.find(({x, y}) => ((x - rect.x) ** 2 + (y - rect.y) ** 2) < MOVEMENT_THRESHOLD ** 2)
    
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
    
                                charsInFrame.push({
                                    name: found.name,
                                    x: rect.x,
                                    y: rect.y,
                                    w: rect.w,
                                    h: rect.h
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
    
                                charsInFrame.push({
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
    
                    idFramesRef.current.push({
                        boxes: charsInFrame,
                        time: video.currentTime
                    })
    
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
            } else if (i.current < idFramesRef.current.length) { // render recorded frames

                ctx.setLineDash([10, 30]);
                const t = video.currentTime

                if (Math.abs(t - idFramesRef.current[i.current].time) < 0.05) {

                    const fr = []

                    for (const box of idFramesRef.current[i.current].boxes) {
                        ctx.strokeRect(box.x * sx, box.y * sy, box.w * sx, box.h * sy)
                        ctx.fillText(box.name, box.x * sx, box.y * sy)
                        fr.push(box.name)
                    }

                    setCurrentFaces(new Set(fr))

                    i.current++
                } else if (i.current > 0) {
                    
                    const f = idFramesRef.current[i.current - 1]

                    if (Math.abs(t - f.time) < 0.05) {

                        const fr = []

                        for (const box of idFramesRef.current[i.current - 1].boxes) {
                            ctx.strokeRect(box.x * sx, box.y * sy, box.w * sx, box.h * sy)
                            ctx.fillText(box.name, box.x * sx, box.y * sy)
                            fr.push(box.name)
                        }

                        setCurrentFaces(new Set(fr))
                    }
                }
            }

            requestAnimationFrame(step)
        }

        requestAnimationFrame(step)
    }

    const onPause = () => {

        if (detect) {
            if (currentClip) {
                const clip: Clip = {
                    name: currentClip.name,
                    start: currentClip.start,
                    end: videoRef.current?.currentTime || 0,
                    status: 'processing'
                }

                setClips([...clips, clip])
            }
        }

        setIsPlaying(false)
    }

    const onSeeked = () => {
        requestAnimationFrame(() => paintVideoToDisplayCanvas())
    }

    const onTimeUpdate = (e: SyntheticEvent<HTMLVideoElement>) => {
        if (isScrubbingRef.current) {
            return
        }

        setCurrentTime(e.currentTarget.currentTime)
    }

    const onEnded = () => {
        setDetect(false)
        latestFacesRef.current = []

        const video = videoRef.current
        const vw = video?.videoWidth || 0
        const vh = video?.videoHeight || 0
        const ctx = canvasRef.current?.getContext('2d')
        const canvas = canvasRef.current
        const cw = canvas?.width || 0
        const ch = canvas?.height || 0

        
        const { dw, dh } = lastDetectionDimsRef.current
        const sx = dw > 0 ? cw / dw : cw / vw
        const sy = dh > 0 ? ch / dh : ch / vh

        for (const box of idFramesRef.current[idFramesRef.current.length - 1].boxes) {
            if (ctx) {
                ctx.strokeRect(box.x * sx, box.y * sy, box.w * sx, box.h * sy)
                ctx.fillText(box.name, box.x * sx, box.y * sy)
            }
        }

        i.current = 0
    }

    return (<>
        <Head title="Video Editor" />
        <ResizablePanelGroup orientation="vertical">
            <ResizablePanel onResize={onResize} id="resizable-video-panel" className="w-full" defaultSize="80%">
            {
            videoFileUrl ? 
            (    <div id="video-container" ref={videoContainerRef} className="w-full h-full bg-purple-950 overflow-hidden">
                    <video
                        id="video"
                        ref={videoRef}
                        crossOrigin="anonymous"
                        playsInline
                        preload="auto"
                        className={cn(
                            'h-full w-full object-cover',
                            metaLoaded
                                ? 'pointer-events-none fixed inset-0 z-0 opacity-0'
                                : 'relative z-0',
                        )}
                        src={videoFileUrl}
                        onLoadedMetadata={onLoadedMetadata}
                        onCanPlay={canPlay}
                        onPlay={onPlay}
                        onPause={onPause}
                        onSeeked={onSeeked}
                        onTimeUpdate={onTimeUpdate}
                        onEnded={onEnded}
                    />
                    <canvas
                        className={cn(!metaLoaded && 'hidden')}
                        style={{
                            marginLeft: '50%',
                            marginTop: document.querySelector('#resizable-video-panel')?.clientHeight * 0.05,
                            transform: 'translate(-50%, 0%)',
                        }}
                        ref={canvasRef}
                        width={dimensions.width}
                        height={dimensions.height}
                    />
                </div>
            ): <Dropzone accept="video/*" className="w-full aspect-video" onSelect={onVideoFileSelect} />
        }
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="20%">
                <div className="flex w-full flex-col gap-2">
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

                            if (!detect) {
                                const t = videoRef.current?.currentTime || 0
                                let low = 0
                                let high = idFramesRef.current.length - 1
                                let mid = Math.floor((low + high) / 2)
                                let found = false

                                while (low <= high && !found) {
                                    mid = Math.floor((low + high) / 2)
                                    

                                    if (idFramesRef.current[mid].time < t) {
                                        //
                                        low = mid + 1
                                    } else if (idFramesRef.current[mid].time > t) {
                                        //
                                        high = mid - 1
                                    } else {
                                        found = true
                                    }
                                }

                                if (found) {
                                    i.current = mid;
                                } else {
                                    i.current = low;
                                }
                            
                            }
                        }}
                        onPointerCancel={(e) => {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                            isScrubbingRef.current = false;
                            setIsScrubbing(false);
                        }}
                    >
                        <div className="relative min-h-44 h-full w-full overflow-visible pb-5">
                            <div
                                id="seeker-line"
                                className={cn(
                                    'pointer-events-none absolute -top-3 bottom-0 z-1 -mr-px w-px overflow-visible bg-neutral-300',
                                    (isScrubbing ? '' : 'transition-all duration-200 ease-linear'))
                                }
                                style={{left: `${currentTime * PX_PER_SECOND * zoomLevel}px`}}
                            >
                                <Triangle
                                    size={15}
                                    className="relative -left-[7px] -top-1 rotate-180 fill-foreground stroke-0 text-foreground"
                                />
                            </div>
                            <div className="relative flex h-full w-full flex-col gap-1.5 bg-neutral-50 dark:bg-neutral-900 pb-5">
                                <div
                                    className="h-5 w-full transition-all duration-250 ease-linear bg-repeat-x"
                                    style={{
                                        backgroundColor: 'transparent',
                                        backgroundImage: `
                                            linear-gradient(90deg, #888 1px, transparent 1px),
                                            linear-gradient(90deg, #666 1px, transparent 1px)
                                        `,
                                        backgroundSize: `${zoomLevel * 50}px 13px, ${zoomLevel * 10}px 5px`,
                                        backgroundPosition: '0 top',
                                    }}
                                />

                                <div className="flex h-full mt-3 w-full items-stretch gap-1">
                                    <div 
                                        className="flex items-start gap-0.25 rounded  bg-neutral-700/65 transition-discrete duration-250 ease-linear"
                                        style={{ width: `${videoLength * PX_PER_SECOND * zoomLevel}px` }}
                                    >
                                    {
                                            clips.map((clip) => <VideoClip framesRef={idFramesRef} key={clip.name} clip={clip} zoomLevel={zoomLevel} />)
                                            
                                        }
                                        {
                                            isPlaying &&  (
                                                <div 
                                                    className="h-full min-h-20 bg-red-500 relative"
                                                    style={{ width: `${((currentTime - (currentClip?.start || 0)) * PX_PER_SECOND * zoomLevel) - (PX_PER_SECOND/5)}px` }}
                                                />
                                            )
                                        }
                                        
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="relative z-10 flex items-center gap-2">
                        <Button
                            disabled={!videoFileUrl}
                            onClick={() => {
                                if (videoFileUrl) {
                                    if (isPlaying) {
                                        videoRef.current?.pause()
                                    } else {
                                        videoRef.current?.play()
                                    }
                                } 
                            }}
                            variant="secondary"
                            size="icon"
                        >
                            {isPlaying ? <Pause /> : <Play />}
                        </Button>
                        <span className="text-sm font-bold">{formatTime(currentTime)}</span>
                    </div>
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    </>)
}

VideoEditor.layout = {
    breadcrumbs: [
        {
            title: 'Editor',
            href: create(),
        },
    ],
};
