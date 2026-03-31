import { ChevronsLeftRight } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';

export function ComparisonSlider() {
    const img1 = 'https://muffinman.io/blog/image-comparison-slider/setnja-01.png';
    const img2 = 'https://muffinman.io/blog/image-comparison-slider/setnja-03.png';

    const containerRef = useRef<HTMLDivElement>(null);
    /** 0–100, 50 = middle */
    const [positionPercent, setPositionPercent] = useState(50);
    const [containerWidth, setContainerWidth] = useState(0);

    const positionPx = useMemo(
        () => (containerWidth * positionPercent) / 100,
        [containerWidth, positionPercent],
    );

    const updatePositionFromClientX = useCallback((clientX: number) => {
        const el = containerRef.current;

        if (!el) {
            return;
        }

        const rect = el.getBoundingClientRect();

        if (rect.width <= 0) {
            return;
        }

        const x = clientX - rect.left;
        const percent = (x / rect.width) * 100;

        setPositionPercent(Math.max(0, Math.min(100, percent)));
    }, []);

    useEffect(() => {
        const el = containerRef.current;

        if (!el) {
            return;
        }

        const sync = () => {
            setContainerWidth(el.getBoundingClientRect().width);
        };

        sync();

        const ro = new ResizeObserver(sync);

        ro.observe(el);

        return () => ro.disconnect();
    }, []);

    return (
        <div className="grow-0">
            <div ref={containerRef} className="relative select-none">
                <div className="relative" style={{ width: `${positionPx}px` }}>
                    <img
                        className="absolute left-0 top-0 h-144 w-auto border-r-2 border-neutral-600 object-cover object-top-left"
                        src={img1}
                        alt="Image 1"
                        draggable={false}
                    />
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 touch-none cursor-ew-resize"
                    style={{ left: `${positionPx}px` }}
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
                    className="h-144 w-auto border-l-2 border-neutral-600 object-cover object-top-right"
                    src={img2}
                    alt="Image 2"
                    draggable={false}
                />
            </div>
            <input
                className="hidden"
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={positionPercent}
                onChange={(e) => setPositionPercent(Number(e.target.value))}
            />
        </div>
    );
}
