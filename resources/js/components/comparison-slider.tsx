import { ChevronsLeftRight } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';

export function ComparisonSlider() {
    const img1 = 'https://muffinman.io/blog/image-comparison-slider/setnja-01.png';
    const img2 = 'https://muffinman.io/blog/image-comparison-slider/setnja-03.png';

    const containerRef = useRef<HTMLDivElement>(null);
    const didInitPosition = useRef(false);
    const [position, setPosition] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);

    const updatePositionFromClientX = useCallback((clientX: number) => {
        const el = containerRef.current;

        if (!el) {
            return;
        }

        const rect = el.getBoundingClientRect();
        const x = clientX - rect.left;

        setPosition(Math.max(0, Math.min(x, rect.width)));
    }, []);

    useEffect(() => {
        const el = containerRef.current;

        if (!el) {
            return;
        }

        const sync = () => {
            const w = el.getBoundingClientRect().width;

            setContainerWidth(w);
            setPosition((prev) => {
                if (!didInitPosition.current && w > 0) {
                    didInitPosition.current = true;

                    return w / 2;
                }

                return Math.min(prev, w);
            });
        };

        sync();

        const ro = new ResizeObserver(sync);

        ro.observe(el);

        return () => ro.disconnect();
    }, []);

    return (
        <div className="grow-0 border-4 border-red-500">
            <div ref={containerRef} className="relative select-none">
                <div className="relative" style={{ width: `${position}px` }}>
                    <img
                        className="absolute left-0 top-0 h-96 w-auto border-r-2 border-neutral-600 object-cover object-top-left"
                        src={img1}
                        alt="Image 1"
                        draggable={false}
                    />
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 touch-none cursor-ew-resize"
                    style={{ left: `${position}px` }}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        updatePositionFromClientX(e.clientX);
                    }}
                    onPointerMove={(e) => {
                        if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
                            return;
                        }

                        updatePositionFromClientX(e.clientX);
                    }}
                    onPointerUp={(e) => {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onPointerCancel={(e) => {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                >
                    <ChevronsLeftRight />
                </Button>
                <img
                    className="h-96 w-auto border-l-2 border-neutral-600 object-cover object-top-right"
                    src={img2}
                    alt="Image 2"
                    draggable={false}
                />
            </div>
            <input
                className='hidden'
                type="range"
                min={0}
                max={Math.max(containerWidth, 1)}
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
            />
        </div>
    );
}
