
import { Head } from '@inertiajs/react'
import '@tensorflow/tfjs-backend-cpu'
import '@tensorflow/tfjs-backend-webgl'
import * as tf from '@tensorflow/tfjs'
/** Maintained face-api.js–compatible API for TensorFlow.js 4.x (original `face-api.js` npm targets old TFJS). */
import * as faceapi from '@vladmandic/face-api'
import type { FaceDetection } from '@vladmandic/face-api'
import { FabricText, Rect, StaticCanvas } from 'fabric'
import { EyeClosed, Maximize, MinusCircle, PanelBottomClose, Pause, Pencil, Play, PlusCircle, ScanFace, SquareStack, Trash, Triangle } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import Dropzone from '@/components/dropzone'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
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
    PX_PER_FRAME, 
} from './video-editor/constants'
import {
    CLIP_CHAR_ROW_HEIGHT_PX,
    CLIP_FIRST_CHAR_ROW_TOP_PX,
    syncClipsFabricCanvas,
} from './video-editor/paint-clips-fabric'
import { syncRulerFabricCanvas } from './video-editor/paint-ruler-fabric'


/** Ruler/timeline content stays at least this far past the playhead (px). */
const TIMELINE_RIGHT_MARGIN_PX = 64

/** Ruler canvas height; must match `paintTimelineRuler` / clips row start. */
const TIMELINE_RULER_HEIGHT_PX = 36

/** Left column for face avatars; matches `CLIP_CHAR_ROW_HEIGHT_PX` so rows line up with Fabric tracks. */
const TIMELINE_FACE_GUTTER_PX = CLIP_CHAR_ROW_HEIGHT_PX

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
    const rulerFabricCanvasRef = useRef<StaticCanvas | null>(null)
    const clipsCanvasRef = useRef<HTMLCanvasElement>(null)
    const clipsFabricCanvasRef = useRef<StaticCanvas | null>(null)
    const clipRecordingStartRef = useRef(0)
    const paintClipsCanvasRef = useRef<() => void>(() => {})
    const rulerContainerRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const videoBlobUrlRef = useRef<string | undefined>(undefined)
    const videoContainerRef = useRef<HTMLDivElement>(null)
    const videoPanelRef = useRef<HTMLDivElement>(null)
    const facesScrollRef = useRef<HTMLDivElement>(null)
    const timelineInnerRef = useRef<HTMLDivElement>(null)

    const [aspectRatio, setAspectRatio] = useState<number|undefined>(undefined)
    const [currentFaces, setCurrentFaces] = useState<Set<string>>(new Set([]))
    const [currentTime, setCurrentTime] = useState(0)
    const [detect, setDetect] = useState(true)
    const [duration, setDuration] = useState(0)
    const [faceApiReady, setFaceApiReady] = useState(false)
    const [faces, setFaces] = useState<Set<string>>(new Set([]))
    const [totalFrames, setTotalFrames] = useState(0)
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
    const [timelineInnerHeightPx, setTimelineInnerHeightPx] = useState(0)
    const [showFaces, setShowFaces] = useState(true)
    const [showFrames, setShowFrames] = useState(false)
    
    useLayoutEffect(() => {
        const el = timelineInnerRef.current

        if (!el) {
            return
        }

        const update = () => {
            setTimelineInnerHeightPx(el.getBoundingClientRect().height)
        }

        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)

        return () => {
            ro.disconnect()
        }
    }, [])

    useEffect(() => {
        setTotalFrames(idFramesRef.current.length)
    }, [idFramesRef])

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
            rulerFabricCanvasRef.current?.dispose()
            rulerFabricCanvasRef.current = null
            clipsFabricCanvasRef.current?.dispose()
            clipsFabricCanvasRef.current = null
        }
    }, [])

    const formatTime = useCallback((time: number, withHours: boolean = false) => {
        const hours = Math.floor(time / 3600)
        const minutes = Math.floor((time % 3600) / 60)
        const seconds = time % 60

        const sub = `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(0).toString().padStart(2, '0')}`

        return withHours ? `${hours.toString().padStart(2, '0')}:${sub}` : sub
    }, [])
    
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
        const gutter = faces.size > 0 ? TIMELINE_FACE_GUTTER_PX : 0
        const x = clientX - rect.left + timeline.scrollLeft - gutter
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
    }, [duration, zoomLevel, faces.size])

    const durationSecForTimeline = duration > 0 ? duration : videoLength > 0 ? videoLength : 0
    const timelineSpanPx =  computeTimelineContentWidthPx({
        durationSec: durationSecForTimeline,
        currentTime,
        viewportCssWidth: timelineViewportWidth,
        zoomLevel,
    })
    const timelineGutterPx = faces.size > 0 && !detect && showFaces ? TIMELINE_FACE_GUTTER_PX : 0
    const timelineContentWidthPx = timelineGutterPx + timelineSpanPx

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
        const gutter = faces.size > 0 ? TIMELINE_FACE_GUTTER_PX : 0
        const playheadPx = gutter + currentTime * pxPerSec
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
    }, [currentTime, zoomLevel, isPlaying, isScrubbing, faces.size])


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
        rulerFabricCanvasRef.current?.dispose()
        rulerFabricCanvasRef.current = null
        clipsFabricCanvasRef.current?.dispose()
        clipsFabricCanvasRef.current = null

        const url = URL.createObjectURL(file)
        videoBlobUrlRef.current = url
        setVideoFileUrl(url)
    }, [])

    const onLoadedMetadata = (e: SyntheticEvent<HTMLVideoElement>)  => {
        calculateAndSetVideoDimensions()
        setShowWhat('canvas')
        
        setDuration(e.currentTarget.duration)
        setVideoLength(e.currentTarget.duration)
        setMetaLoaded(true)
    }

    const canPlay = () => paintVideoToDisplayCanvas()

    const onPlay = () => {

        if (detect) {
            const t0 = videoRef.current?.currentTime || 0
            clipRecordingStartRef.current = t0
            setCurrentClip({
                name: 'Clip ' + (clips.length + 1),
                start: t0,
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

                    paintClipsCanvasRef.current()
    
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

            if (detect && !video.paused) {
                paintClipsCanvasRef.current()
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
        const el = rulerCanvasRef.current
        const container = rulerContainerRef.current

        if (!el || !container) {
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

        let cssWidth = computeTimelineContentWidthPx({
            durationSec,
            currentTime,
            viewportCssWidth: timelineViewportWidth,
            zoomLevel,
        })

        if (showFrames) {
            cssWidth = idFramesRef.current.length * PX_PER_FRAME;
        }

        const cssHeight = TIMELINE_RULER_HEIGHT_PX

        let fabricCanvas = rulerFabricCanvasRef.current

        if (fabricCanvas && fabricCanvas.lowerCanvasEl !== el) {
            fabricCanvas.dispose()
            fabricCanvas = null
            rulerFabricCanvasRef.current = null
        }

        if (!fabricCanvas) {
            fabricCanvas = new StaticCanvas(el, {
                width: cssWidth,
                height: cssHeight,
                enableRetinaScaling: true,
            })
            rulerFabricCanvasRef.current = fabricCanvas
        }

        syncRulerFabricCanvas(fabricCanvas, {
            cssWidth,
            cssHeight,
            zoomLevel,
            formatTime: (t) => formatTime(t),
            showFrames,
            totalFrames: idFramesRef.current.length,
        })
    }, [zoomLevel, currentTime, duration, videoLength, timelineViewportWidth, formatTime, showFrames, idFramesRef])

    useEffect(() => {
        paintTimelineRuler()
    }, [paintTimelineRuler])

    const paintClipsCanvas = useCallback(() => {
        const el = clipsCanvasRef.current

        if (!el) {
            return
        }

        const vl =
            videoLength > 0
                ? videoLength
                : duration > 0
                  ? duration
                  : videoRef.current && videoRef.current.duration > 0
                    ? videoRef.current.duration
                    : 0

        const videoLengthSec = Math.max(vl, 1e-6)
        const pxPerSec = PX_PER_SECOND * zoomLevel
        let trackWidthPx = Math.max(
            1,
            timelineSpanPx,
            videoLengthSec * pxPerSec,
        )

        if (showFrames) {
            trackWidthPx = idFramesRef.current.length * PX_PER_FRAME;
        }

        const placeholderH = 80

        let fabricCanvas = clipsFabricCanvasRef.current

        if (fabricCanvas && fabricCanvas.lowerCanvasEl !== el) {
            fabricCanvas.dispose()
            fabricCanvas = null
            clipsFabricCanvasRef.current = null
        }

        if (!fabricCanvas) {
            fabricCanvas = new StaticCanvas(el, {
                width: trackWidthPx,
                height: placeholderH,
                enableRetinaScaling: true,
            })
            clipsFabricCanvasRef.current = fabricCanvas
        }

        syncClipsFabricCanvas(fabricCanvas, idFramesRef.current, {
            clips,
            zoomLevel,
            trackWidthPx,
            isPlaying,
            detect,
            liveVideoTimeSec: videoRef.current?.currentTime ?? currentTime,
            recordingStartSec: clipRecordingStartRef.current,
            spinnerAngleRad: (performance.now() / 400) % (Math.PI * 2),
            showFrames: showFrames,
            chars: [...faces],
            totalFrames: idFramesRef.current.length,
        })
    }, [
        clips,
        zoomLevel,
        videoLength,
        duration,
        isPlaying,
        detect,
        currentTime,
        timelineSpanPx,
        showFrames,
        faces,
    ])

    useEffect(() => {
        paintClipsCanvasRef.current = paintClipsCanvas
    }, [paintClipsCanvas])

    useEffect(() => {
        paintClipsCanvas()
    }, [paintClipsCanvas])

    return (<>
        <Head title="Video Editor" />
        <ResizablePanelGroup orientation="vertical">
            <ResizablePanel elementRef={videoPanelRef} onResize={onResize} id="resizable-video-panel" className="w-full" defaultSize="70%">
            {
            videoFileUrl ? 
            (    <div id="video-container" ref={videoContainerRef} className="w-full h-full bg-muted dark:bg-neutral-950 overflow-hidden">
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
                    />
                </div>
            ): <Dropzone accept="video/*" className="w-full aspect-video" onSelect={onVideoFileSelect} />
        }
            </ResizablePanel>
            <ResizableHandle className='z-20' onClick={() => {
                paintVideoToDisplayCanvas()
                setShowWhat('canvas')
            }} withHandle />
            <ResizablePanel defaultSize="30%" className="flex min-h-0 flex-col">
                <div className="flex h-full min-h-0 w-full flex-col">
                    <div className="grid shrink-0 grid-cols-3 items-center gap-2 bg-background pt-4 pb-4">
                        <div className='flex justify-start items-center pl-3 gap-3'>
                            <Button onClick={() => setShowFaces(!showFaces)} size="icon" variant="ghost">
                                <span><ScanFace strokeWidth={2.75} /></span>
                            </Button>
                            <Button onClick={() => {
                                setVideoFileUrl(undefined)
                                setMetaLoaded(false)
                            }} size="icon" variant="ghost">
                                <span><Trash strokeWidth={2.75} /></span>
                            </Button>
                            <Button onClick={() => setShowFrames(!showFrames)} size="icon" variant="ghost">
                                <span><SquareStack  strokeWidth={2.15} /></span>
                            </Button>
                        </div>
                        <div className="flex justify-center items-center gap-1">
                            <Button
                                className="cursor-pointer rounded-full transition-transform duration-200 hover:scale-125"
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
                                
                                size="icon-xs"
                            >
                                {isPlaying ? <Pause className="fill-background" /> : <Play className="fill-background" />}
                            </Button>
                            <div className="text-sm font-bold flex justify-center items-center h-5 font-mono">
                                <div className="w-12 text-center -mr-0.5">{formatTime(currentTime)}</div>
                                <Separator className='bg-muted-foreground/50 mx-0.5 border-x border-muted-foreground/50' orientation="vertical" />
                                <div className='w-12 text-center text-muted-foreground -ml-0.5'>{formatTime(videoLength)}</div>
                            </div>
                        </div>
                        <div className='flex justify-end items-center gap-3 h-full pr-3'>
                            <Button onClick={() => {
                                setZoomLevel((z) => z - 0.5)
                            }} size="icon" variant="ghost">
                                <span><MinusCircle strokeWidth={2.25} /></span>
                            </Button>
                            <Slider className='w-32' value={[zoomLevel]}
                                max={15}
                                min={1}
                                step={0.5}
                                onValueChange={(value) => setZoomLevel(value[0])}
                            />
                            <Button onClick={() => setZoomLevel((z) => z + 0.5)} size="icon" variant="ghost">
                                <span><PlusCircle strokeWidth={2.25} /></span>
                            </Button>
                            <Separator orientation="vertical" />
                            <Button size="icon" variant="ghost">
                                <span><PanelBottomClose strokeWidth={2.25} /></span>
                            </Button>
                            <Button size="icon" variant="ghost">
                                <span><Maximize strokeWidth={3} /></span>
                            </Button>
                        </div>
                    </div>
                    <div className="relative flex min-h-0 flex-1 flex-col border-t">
                        {
                            showFaces && !detect && (
                                <div className="h-9 w-15 bg-background relative top-0 -mb-9 z-50 border-t" />
                            )
                        }
                        <div
                            ref={timelineScrollRef}
                            className="min-h-0 w-full flex-1 cursor-col-resize touch-none select-none overflow-x-auto overflow-y-auto "
                            
                        >
                            <div
                                ref={timelineInnerRef}
                                className="relative min-h-0 min-w-0 overflow-x-visible bg-background"
                                style={{ width: `${timelineContentWidthPx}px` }}
                            >
                                <div className="sticky top-0 z-40 h-0 w-full overflow-visible pointer-events-none">
                                    <div
                                        id="seeker-line"
                                        className={cn(
                                            'pointer-events-none absolute -mr-px w-px overflow-visible bg-foreground',
                                            isScrubbing ? '' : ' z-100',
                                        )}
                                        style={{
                                            left: `${(timelineGutterPx + currentTime * PX_PER_SECOND * zoomLevel) + ((detect && isPlaying) ? 10 : -3)}px`, // -3 when playing back  // + 10 when scrubbing
                                            top: 0,
                                            height: Math.max(timelineInnerHeightPx, 1),
                                        }}
                                    >
                                        <Triangle
                                            size={15}
                                            className="pointer-events-none absolute -left-[7px] -top-0.5 rotate-180 fill-foreground stroke-0 text-foreground"
                                        />
                                    </div>
                                </div>

                                <div className="sticky top-0 z-30 flex w-full"
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        isScrubbingRef.current = true;
                                        setIsScrubbing(true);
                                        e.currentTarget.setPointerCapture(e.pointerId);
                                        setTimeFromClientX(e.clientX);
                                        console.log('pointer down')
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
                                        className="transition-discrete duration-200 sticky z-200 left-0 bg-background"
                                        style={{ width: timelineGutterPx }}
                                        aria-hidden
                                    >
                                    </div>
                                    
                                    <div
                                        ref={rulerContainerRef}
                                        className="min-w-0 z-100"
                                        style={{ width: timelineSpanPx }}
                                    >
                                        <canvas
                                            id="ruler-line"
                                            ref={rulerCanvasRef}
                                            className="block max-w-none border-t border-muted-foreground/40 bg-background"
                                            aria-hidden
                                        />
                                    </div>
                                </div>

                                <div className="flex w-full min-w-0 bg-muted/30">
                                    <div
                                        ref={facesScrollRef}
                                        className="border-r border-muted-foreground/40 bg-background transition-all duration-200 overflow-clip sticky left-0 z-100"
                                        style={{
                                            width: timelineGutterPx,
                                            paddingTop: CLIP_FIRST_CHAR_ROW_TOP_PX,
                                        }}
                                    >
                                    { 
                                        !detect && [...faces].map((face) => (
                                            <div
                                                className="flex items-center justify-center"
                                                style={{ height: CLIP_CHAR_ROW_HEIGHT_PX }}
                                                key={face}
                                            >
                                                <Tooltip>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <TooltipTrigger asChild>
                                                                <Button className='rounded-full' size="icon-lg" variant="ghost" type="button">
                                                                    <img
                                                                        className="size-6"
                                                                        alt={`${face}'s avatar image`}
                                                                        src={`https://api.dicebear.com/9.x/big-smile/svg?seed=${face}`}
                                                                    />
                                                                </Button>
                                                            </TooltipTrigger>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent side="right" align="end" className="z-100 w-40">
                                                            <DropdownMenuGroup>
                                                                <DropdownMenuLabel>{face}</DropdownMenuLabel>
                                                            <DropdownMenuItem>
                                                                <Pencil />
                                                                Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem>
                                                                <EyeClosed />
                                                                Hide
                                                            </DropdownMenuItem>
                                                            </DropdownMenuGroup>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuGroup>
                                                            <DropdownMenuItem variant="destructive">
                                                                <Trash />
                                                                Delete
                                                            </DropdownMenuItem>
                                                            </DropdownMenuGroup>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                
                                                    <TooltipContent>
                                                        {face}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        ))
                                    }
                                    </div>
                                    <div
                                        className="min-w-0 shrink-0 border-r border-teal-300"
                                        style={{ width: showFrames ? totalFrames * PX_PER_FRAME : timelineSpanPx }}
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
                                        <canvas
                                            ref={clipsCanvasRef}
                                            className="block max-w-none"
                                            aria-label="Video clips timeline"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
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
