import type { StaticCanvas } from 'fabric'

export type FaceBox = { x: number; y: number; w: number; h: number }

export type FaceFrame = { faces: FaceBox[]; time: number }

export type IdentityBox = FaceBox & { name: string }

export type IdentityFrame = { boxes: IdentityBox[]; time: number }

export type TimeRange = {
    start: number
    end?: number
}

export type Clip = {
    name: string
    status: 'initializing' | 'processing' | 'ready'
    //position: number
} & TimeRange

export type CharacterTimeRange = {
    name: string
    ranges: (TimeRange & {firstFrame?: number, lastFrame?: number})[]
    lastFrame: number
}

export type DisplayCanvasDraw = {
    fCanvas: StaticCanvas
    /** Logical width (CSS px), same as Fabric canvas width — use for face overlay math. */
    cw: number
    ch: number
    vw: number
    vh: number
}

export type FaceFabricRect = {
    x: number
    y: number
    w: number
    h: number
    dashed?: boolean
}

export type FaceFabricLabel = { x: number; y: number; text: string }

