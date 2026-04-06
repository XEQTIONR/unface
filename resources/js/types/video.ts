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
    ranges: TimeRange[]
    lastFrame: number
}

