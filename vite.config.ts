import path from 'node:path';
import { fileURLToPath } from 'node:url';

import inertia from '@inertiajs/vite';
import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            // Real @mediapipe/face_detection is UMD without a Rolldown-friendly named export; we only use TF.js runtime.
            '@mediapipe/face_detection': path.resolve(
                __dirname,
                'resources/js/stubs/mediapipe-face-detection.ts',
            ),
        },
    },
    optimizeDeps: {
        include: [
            '@tensorflow/tfjs',
            '@tensorflow/tfjs-core',
            '@tensorflow/tfjs-backend-webgl',
            '@tensorflow/tfjs-backend-cpu',
            '@tensorflow-models/face-detection',
        ],
    },
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            refresh: true,
        }),
        inertia(),
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
        wayfinder({
            formVariants: true,
        }),
    ],
});
