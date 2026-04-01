/**
 * Vite/Rolldown cannot resolve ESM named exports from @mediapipe/face_detection (UMD build).
 * @tensorflow-models/face-detection only needs this for runtime: "mediapipe"; we use runtime: "tfjs".
 * This stub satisfies the static import so the bundle builds; it is never executed for our path.
 */
export class FaceDetection {
    constructor(_options?: unknown) {}

    close(): void {}

    reset(): void {}

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    setOptions(_options: unknown): void {}

    onResults(_callback: unknown): void {}

    send(_input: unknown): Promise<void> {
        return Promise.resolve();
    }
}
