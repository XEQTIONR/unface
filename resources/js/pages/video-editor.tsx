
import { Head } from '@inertiajs/react'
import '@tensorflow/tfjs-backend-cpu'
import '@tensorflow/tfjs-backend-webgl'
import * as tf from '@tensorflow/tfjs'
/** Maintained face-api.js–compatible API for TensorFlow.js 4.x (original `face-api.js` npm targets old TFJS). */
import * as faceapi from '@vladmandic/face-api'
import type { FaceDetection } from '@vladmandic/face-api'
import { FabricText, Rect, StaticCanvas } from 'fabric'
import { Pause, Play, Triangle } from 'lucide-react'
import { useCallback, useRef, useState, useEffect } from 'react'
import type { SyntheticEvent } from 'react'
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

/** Ruler/timeline content stays at least this far past the playhead (px). */
const TIMELINE_RIGHT_MARGIN_PX = 64

function computeTimelineContentWidthPx(opts: {
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

const FACE_OVERLAY_KEY = '__unfaceFaceOverlay' as const

const cyanOverlayStroke = 'rgba(0, 255, 255, 0.95)'

function removeFabricFaceOverlays(f: StaticCanvas) {
    const tagged = f
        .getObjects()
        .filter(
            (o) =>
                (o as unknown as Record<string, boolean | undefined>)[FACE_OVERLAY_KEY] === true,
        )

    if (tagged.length) {
        f.remove(...tagged)
    }
}

type FaceFabricRect = {
    x: number
    y: number
    w: number
    h: number
    dashed?: boolean
}

type FaceFabricLabel = { x: number; y: number; text: string }

function tagFaceOverlay<T>(o: T): T {
    ;(o as unknown as Record<string, boolean>)[FACE_OVERLAY_KEY] = true

    return o
}

function replaceFabricFaceOverlays(
    f: StaticCanvas,
    rects: FaceFabricRect[],
    labels: FaceFabricLabel[],
    opts: { strokeWidth: number; fontSize: number },
) {
    removeFabricFaceOverlays(f)

    for (const r of rects) {
        f.add(
            tagFaceOverlay(
                new Rect({
                    left: r.x,
                    top: r.y,
                    width: Math.max(1, r.w),
                    height: Math.max(1, r.h),
                    fill: 'transparent',
                    stroke: cyanOverlayStroke,
                    strokeWidth: opts.strokeWidth,
                    strokeUniform: true,
                    strokeDashArray: r.dashed ? [10, 30] : undefined,
                    originX: 'left',
                    originY: 'top',
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                }),
            ),
        )
    }

    for (const t of labels) {
        f.add(
            tagFaceOverlay(
                new FabricText(t.text, {
                    left: t.x,
                    top: t.y,
                    fill: cyanOverlayStroke,
                    fontSize: opts.fontSize,
                    fontFamily: 'Arial',
                    originX: 'left',
                    originY: 'top',
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                }),
            ),
        )
    }

    f.renderAll()
}

type DisplayCanvasDraw = {
    fCanvas: StaticCanvas
    /** Logical width (CSS px), same as Fabric canvas width — use for face overlay math. */
    cw: number
    ch: number
    vw: number
    vh: number
}

export default function VideoEditor() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const fabricCanvasRef = useRef<StaticCanvas | null>(null)
    const chars = useRef<IdentityBox[]>([])
    const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const i = useRef(0)
    const idFramesRef = useRef<IdentityFrame[]>([])
    const isScrubbingRef = useRef(false)
    const lastDetectionDimsRef = useRef({ dw: 0, dh: 0 })
    const latestFacesRef = useRef<FaceBox[]>([])
    const names = useRef(allNames)
    const timelineScrollRef = useRef<HTMLDivElement>(null)
    const rulerCanvasRef = useRef<HTMLCanvasElement>(null)
    const rulerContainerRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const videoBlobUrlRef = useRef<string | undefined>(undefined)
    const videoContainerRef = useRef<HTMLDivElement>(null)
    const videoPanelRef = useRef<HTMLDivElement>(null)

    const [aspectRatio, setAspectRatio] = useState<number|undefined>(undefined)
    const [currentFaces, setCurrentFaces] = useState<Set<string>>(new Set([]))
    const [currentTime, setCurrentTime] = useState(0)
    const [detect, setDetect] = useState(true)
    const [duration, setDuration] = useState(0)
    const [faceApiReady, setFaceApiReady] = useState(false)
    const [faces, setFaces] = useState<Set<string>>(new Set([]))
    const [isPlaying, setIsPlaying] = useState(false)
    const [isScrubbing, setIsScrubbing] = useState(false)
    const [metaLoaded, setMetaLoaded] = useState(false)
    const [videoLength, setVideoLength] = useState(0)
    const [zoomLevel, setZoomLevel] = useState(3)
    const [clips, setClips] = useState<Clip[]>([])
    const [currentClip, setCurrentClip] = useState<Clip | null>(null)
    const [videoFileUrl, setVideoFileUrl] = useState<string | undefined>(undefined)
    const [videoPanelHeight, setVideoPanelHeight] = useState(0)
    const [showWhat, setShowWhat] = useState<'video' | 'canvas'>('canvas')
    const [timelineViewportWidth, setTimelineViewportWidth] = useState(0)

    useEffect(() => {
        if (videoPanelRef.current) {
            setVideoPanelHeight(videoPanelRef.current.clientHeight)
        }
    }, [videoPanelRef])

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

    useEffect(() => {
        return () => {
            void fabricCanvasRef.current?.dispose()
            fabricCanvasRef.current = null
        }
    }, [])

    const formatTime = (time: number, withHours: boolean = false) => {
        const hours = Math.floor(time / 3600)
        const minutes = Math.floor((time % 3600) / 60)
        const seconds = time % 60

        const sub = `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(0).toString().padStart(2, '0')}`

        return withHours ? `${hours.toString().padStart(2, '0')}:${sub}` : sub
    }
    
    /**
     * Fabric StaticCanvas drives sizing/retina/DPR; the live `<video>` is painted with 2D
     * `drawImage` in `before:render`. `FabricImage(video)` is unreliable across browsers for
     * decoded frames — this keeps Fabric while matching native canvas behaviour.
     */
    const paintVideoToDisplayCanvas = useCallback((): DisplayCanvasDraw | null => {
        const video = videoRef.current
        const el = canvasRef.current

        if (!video || !el) {
            return null
        }

        const vw = video.videoWidth
        const vh = video.videoHeight

        if (!vw || !vh) {
            return null
        }

        const w = video.clientWidth || video.offsetWidth
        const h = video.clientHeight || video.offsetHeight

        if (!w || !h) {
            return null
        }

        let fCanvas = fabricCanvasRef.current

        if (fCanvas && fCanvas.lowerCanvasEl !== el) {
            void fCanvas.dispose()
            fCanvas = null
            fabricCanvasRef.current = null
        }

        if (!fCanvas) {
            fCanvas = new StaticCanvas(el, {
                width: w,
                height: h,
                enableRetinaScaling: true,
                skipOffscreen: false,
            })
            fabricCanvasRef.current = fCanvas

            fCanvas.on('before:render', ({ ctx }) => {
                const v = videoRef.current
                const c = fabricCanvasRef.current

                if (
                    !v ||
                    !c ||
                    c !== fCanvas ||
                    v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
                    !v.videoWidth ||
                    !v.videoHeight
                ) {
                    return
                }

                const lw = c.getWidth()
                const lh = c.getHeight()

                ctx.imageSmoothingEnabled = true
                ctx.imageSmoothingQuality = 'high'
                ctx.drawImage(v, 0, 0, lw, lh)
            })
        } else if (fCanvas.getWidth() !== w || fCanvas.getHeight() !== h) {
            fCanvas.setDimensions({ width: w, height: h })
        }

        const legacyFabricImages = fCanvas.getObjects().filter((o) => o.type === 'image')

        if (legacyFabricImages.length) {
            fCanvas.remove(...legacyFabricImages)
        }

        removeFabricFaceOverlays(fCanvas)
        fCanvas.calcViewportBoundaries()
        fCanvas.renderAll()

        return { fCanvas, cw: w, ch: h, vw, vh }
    }, [])

    const setTimeFromClientX = useCallback((clientX: number) => {
        const timeline = timelineScrollRef.current
        const video = videoRef.current

        if (!timeline || !video) {
            return
        }

        const rect = timeline.getBoundingClientRect()
        const x = clientX - rect.left + timeline.scrollLeft
        const raw = x / (PX_PER_SECOND * zoomLevel)
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
    }, [duration, zoomLevel])

    const durationSecForTimeline =
        duration > 0 ? duration : videoLength > 0 ? videoLength : 0
    const timelineSpanPx = computeTimelineContentWidthPx({
        durationSec: durationSecForTimeline,
        currentTime,
        viewportCssWidth: timelineViewportWidth,
        zoomLevel,
    })

    useEffect(() => {
        const el = timelineScrollRef.current

        if (!el) {
            return
        }

        const ro = new ResizeObserver(() => {
            setTimelineViewportWidth(el.clientWidth)
        })
        ro.observe(el)
        setTimelineViewportWidth(el.clientWidth)

        return () => {
            ro.disconnect()
        }
    }, [])

    useEffect(() => {
        const el = timelineScrollRef.current

        if (!el || !isPlaying || isScrubbing) {
            return
        }

        const pxPerSec = PX_PER_SECOND * zoomLevel
        const playheadPx = currentTime * pxPerSec
        const margin = TIMELINE_RIGHT_MARGIN_PX
        const viewW = el.clientWidth
        const maxScroll = Math.max(0, el.scrollWidth - viewW)
        let next = el.scrollLeft

        if (playheadPx < next + margin) {
            next = Math.max(0, playheadPx - margin)
        }

        if (playheadPx > next + viewW - margin) {
            next = Math.min(maxScroll, playheadPx - viewW + margin)
        }

        if (next !== el.scrollLeft) {
            el.scrollLeft = next
        }
    }, [currentTime, zoomLevel, isPlaying, isScrubbing])


    const calculateAndSetVideoDimensions = useCallback(() => {
        const video = videoRef.current as HTMLVideoElement
        
        if (!video) {
            return
        }

        const h = video.videoHeight
        const w = video.videoWidth
        const ratio = w/h

        if (aspectRatio !== ratio) {
            setAspectRatio(ratio)
        }

        const panel = videoPanelRef.current as HTMLDivElement

        setShowWhat('video')
        setVideoPanelHeight(panel.offsetHeight)
    }, [aspectRatio, videoRef])

    const onResize = calculateAndSetVideoDimensions

    const onVideoFileSelect = useCallback((file: File) => {
        if (videoBlobUrlRef.current) {
            URL.revokeObjectURL(videoBlobUrlRef.current)
        }

        void fabricCanvasRef.current?.dispose()
        fabricCanvasRef.current = null

        const url = URL.createObjectURL(file)
        videoBlobUrlRef.current = url
        setVideoFileUrl(url)
    }, [])

    const onLoadedMetadata = (e: SyntheticEvent<HTMLVideoElement>)  => {
        calculateAndSetVideoDimensions()
        // setTimeout(() => {
            setShowWhat('canvas')
        // }, 100)
        
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

        function step() {
            const video = videoRef.current;

            if (!video || video.paused || video.ended) {
                return;
            }

            const drawn = paintVideoToDisplayCanvas();

            if (!drawn) {
                requestAnimationFrame(step);

                return;
            }

            const { fCanvas, cw, ch, vw, vh } = drawn;

            const { dw, dh } = lastDetectionDimsRef.current;
            const sx = dw > 0 ? cw / dw : cw / vw;
            const sy = dh > 0 ? ch / dh : ch / vh;

            const overlayRects: FaceFabricRect[] = []
            const overlayLabels: FaceFabricLabel[] = []
            const strokeW = Math.max(2, Math.round(cw / 400))
            const fontSize = 30
            const currentNames: string[] = []

            if (detect) {
                let ns: IdentityBox[] = [...chars.current];
                const charsInFrame: IdentityBox[] = []
                
                let comparedTo: IdentityBox[] = [...chars.current];

                if (latestFacesRef.current.length > 0) {
                    for (const rect of latestFacesRef.current.sort((a, b) => a.x - b.x)) {
                        overlayRects.push({
                            x: rect.x * sx,
                            y: rect.y * sy,
                            w: rect.w * sx,
                            h: rect.h * sy,
                        })
    
                        if (chars.current.length === 0) { // no characters yet
                            const name = names.current[ns.length % names.current.length] + Math.floor(Math.random() * 1000)
                            overlayLabels.push({ x: rect.x * sx, y: rect.y * sy, text: name })
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
                                overlayLabels.push({ x: rect.x * sx, y: rect.y * sy, text: found.name })
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
                                overlayLabels.push({ x: rect.x * sx, y: rect.y * sy, text: n })
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

                const t = video.currentTime

                if (Math.abs(t - idFramesRef.current[i.current].time) < 0.05) {

                    const fr = []

                    for (const box of idFramesRef.current[i.current].boxes) {
                        overlayRects.push({
                            x: box.x * sx,
                            y: box.y * sy,
                            w: box.w * sx,
                            h: box.h * sy,
                            dashed: true,
                        })
                        overlayLabels.push({ x: box.x * sx, y: box.y * sy, text: box.name })
                        fr.push(box.name)
                    }

                    setCurrentFaces(new Set(fr))

                    i.current++
                } else if (i.current > 0) {
                    
                    const f = idFramesRef.current[i.current - 1]

                    if (Math.abs(t - f.time) < 0.05) {

                        const fr = []

                        for (const box of idFramesRef.current[i.current - 1].boxes) {
                            overlayRects.push({
                                x: box.x * sx,
                                y: box.y * sy,
                                w: box.w * sx,
                                h: box.h * sy,
                                dashed: true,
                            })
                            overlayLabels.push({ x: box.x * sx, y: box.y * sy, text: box.name })
                            fr.push(box.name)
                        }

                        setCurrentFaces(new Set(fr))
                    }
                }
            }

            replaceFabricFaceOverlays(fCanvas, overlayRects, overlayLabels, {
                strokeWidth: strokeW,
                fontSize,
            })

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

        const drawn = paintVideoToDisplayCanvas()

        if (!drawn || !idFramesRef.current.length) {
            i.current = 0

            return
        }

        const { fCanvas, cw, ch, vw, vh } = drawn

        const { dw, dh } = lastDetectionDimsRef.current
        const sx = dw > 0 ? cw / dw : cw / vw
        const sy = dh > 0 ? ch / dh : ch / vh

        const boxes = idFramesRef.current[idFramesRef.current.length - 1].boxes
        const overlayRects: FaceFabricRect[] = []
        const overlayLabels: FaceFabricLabel[] = []

        for (const box of boxes) {
            overlayRects.push({
                x: box.x * sx,
                y: box.y * sy,
                w: box.w * sx,
                h: box.h * sy,
            })
            overlayLabels.push({ x: box.x * sx, y: box.y * sy, text: box.name })
        }

        replaceFabricFaceOverlays(fCanvas, overlayRects, overlayLabels, {
            strokeWidth: Math.max(2, Math.round(cw / 400)),
            fontSize: 60,
        })

        i.current = 0
    }

    const paintTimelineRuler = useCallback(() => {
        const canvas = rulerCanvasRef.current
        const container = rulerContainerRef.current

        if (!canvas || !container) {
            return
        }

        const durationSec =
            videoRef.current &&
            Number.isFinite(videoRef.current.duration) &&
            videoRef.current.duration > 0
                ? videoRef.current.duration
                : duration > 0
                  ? duration
                  : videoLength > 0
                    ? videoLength
                    : 0

        const cssWidth = computeTimelineContentWidthPx({
            durationSec,
            currentTime,
            viewportCssWidth: timelineViewportWidth,
            zoomLevel,
        })

        const cssHeight = 36
        const dpr = window.devicePixelRatio || 1

        canvas.width = Math.max(1, Math.floor(cssWidth * dpr))
        canvas.height = Math.max(1, Math.floor(cssHeight * dpr))
        canvas.style.width = `${cssWidth}px`
        //canvas.style.height = `${cssHeight}px`

        const ctx = canvas.getContext('2d')

        if (!ctx) {
            return
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, cssWidth, cssHeight)

        const majorStep = zoomLevel * 50
        const minorStep = zoomLevel * 10

        if (minorStep <= 0 || majorStep <= 0) {
            return
        }

        ctx.font = '12px Arial'

        for (let i = 0; ; i++) {
            const x = i * minorStep

            if (x > cssWidth) {
                break
            }

            if (i % 5 === 0) {
                continue
            }

            ctx.fillStyle = '#444'
            ctx.fillRect(Math.floor(x), 2, 1, 3)
        }

        for (let j = 0; ; j++) {
            const x = j * majorStep

            if (x > cssWidth) {
                break
            }

            ctx.fillStyle = '#444'
            ctx.fillRect(Math.floor(x), 2, 1, 20)
            ctx.fillStyle = '#888'
            ctx.fillText(formatTime(j*5), Math.floor(x) + 8, 24)
        }
    }, [zoomLevel, currentTime, duration, videoLength, timelineViewportWidth])

    useEffect(() => {
        paintTimelineRuler()
    }, [paintTimelineRuler])

    return (<>
        <Head title="Video Editor" />
        <ResizablePanelGroup orientation="vertical">
            <ResizablePanel elementRef={videoPanelRef} onResize={onResize} id="resizable-video-panel" className="w-full" defaultSize="70%">
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
                            'object-cover pointer-events-none inset-0',
                            metaLoaded && showWhat === 'video'
                                ? 'relative left-1/2 -translate-x-1/2'
                                : // Near-opaque 0: full opacity-0 often yields blank drawImage into canvas
                                  'fixed z-0 opacity-[0.01]',
                        )}
                        style={{
                            aspectRatio: aspectRatio,
                            marginTop: videoPanelHeight * 0.05,
                            height: videoPanelHeight * 0.9,
                        }}
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
                            marginTop: videoPanelHeight * 0.05,
                            transform: 'translate(-50%, 0%)',
                            
                        }}
                        ref={canvasRef}
                        //width={videoPanelHeight * 0.9 * (aspectRatio || 1)}
                        //height={videoPanelHeight * 0.9}
                    />
                </div>
            ): <Dropzone accept="video/*" className="w-full aspect-video" onSelect={onVideoFileSelect} />
        }
            </ResizablePanel>
            <ResizableHandle onClick={() => {
                paintVideoToDisplayCanvas()
                setShowWhat('canvas')
            }} withHandle />
            <ResizablePanel defaultSize="30%">
                <div className="flex w-full flex-col gap-2 mt-3">
                    <div
                        ref={timelineScrollRef}
                        className="relative w-full cursor-col-resize touch-none select-none overflow-x-auto pt-3"
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
                        <div
                            className="relative min-h-44 h-full overflow-visible pb-5"
                            style={{ width: `${timelineSpanPx}px` }}
                        >
                            <div
                                id="seeker-line"
                                className={cn(
                                    'pointer-events-none absolute top-0 bottom-0 z-1 -mr-px w-px overflow-visible bg-neutral-300',
                                    (isScrubbing ? '' : 'transition-all duration-250 ease-linear'))
                                }
                                style={{left: `${currentTime * PX_PER_SECOND * zoomLevel}px`}}
                            >
                                <Triangle
                                    size={15}
                                    className="relative -left-[7px] -top-0.5 rotate-180 fill-foreground stroke-0 text-foreground"
                                />
                            </div>
                            <div className="relative flex h-full w-full flex-col gap-1.5 bg-neutral-50 dark:bg-neutral-900 pb-5">
                                <div ref={rulerContainerRef} className="w-full">
                                    <canvas
                                        id="ruler-line"
                                        ref={rulerCanvasRef}
                                        className="block w-full border-t border-muted-foreground/40"
                                        aria-hidden
                                    />
                                </div>

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
