export type FaceBox = { x: number; y: number; w: number; h: number }

export type FaceFrame = { faces: FaceBox[]; time: number }

export type IdentityBox = FaceBox & { name: string }

export type IdentityFrame = { boxes: IdentityBox[]; time: number }