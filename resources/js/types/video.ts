export type FaceBox = { x: number; y: number; w: number; h: number }

/** Minimal shape for SSD face detections (face-api.js `FaceDetection`). */
export type FaceApiDetection = { box: { x: number; y: number; width: number; height: number } }

export type FaceFrame = { faces: FaceBox[]; time: number }

export type IdentityBox = FaceBox & { name: string }

export type IdentityFrame = { boxes: IdentityBox[]; time: number }