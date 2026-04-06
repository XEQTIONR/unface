export const PX_PER_SECOND = 10;

/** How often to run face detection (ms). Lower = fresher boxes; slightly higher can help stability on slow GPUs. */
export const DETECTION_INTERVAL_MS = 50;

/**
 * Longest side (px) fed into the detector when the video is larger than this.
 * Smaller sources use **native** resolution (no upscale).
 */
export const MAX_DETECTION_LONG_SIDE = 720

export const MOVEMENT_THRESHOLD = 50

/** SSD MobileNet v1 weights (same family as face-api.js). */
export const FACE_API_MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

export const names = [
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
]