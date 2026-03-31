import { useState, useRef, useEffect } from 'react';

export function ComparisonSlider() {

    const img1 = 'https://muffinman.io/blog/image-comparison-slider/setnja-01.png'
    const img2 = 'https://muffinman.io/blog/image-comparison-slider/setnja-03.png'

    const [position, setPosition] = useState(100)
    const [unit, setUnit] = useState<('%'|'px')>('%')
    const img1Ref = useRef<HTMLImageElement>(null)
    const [maxWidth, setMaxWidth] = useState(0)

    useEffect(() => {
        if (unit === '%') {
            const w = img1Ref.current?.width ?? 0
            console.log('w:',w)
            setMaxWidth(() => w)
            setPosition(() => 0)
            setUnit(() => 'px')
        }

        
    }, [unit, setMaxWidth, setPosition])

    return (
        <div className='w-full border-2 border-red-600'>    
            <div className=" bg-purple-700 h-100 relative -left-1/2 translate-x-1/2">
                <div className='border-2 border-green-600 relative'
                    style={{ width: `${position}${unit}` }}
                >
                    <img ref={img1Ref} className='h-96 w-auto absolute top-0 left-0 object-cover object-top-left' src={img1} alt='Image 1' />
                </div>
                {/* <img ref={img1Ref} className='h-96 w-auto absolute top-0 left-0 object-cover object-top-left' src={img2} alt='Image 2' /> */}
            </div>
            <input 
                type="range" 
                min="0" 
                max={maxWidth.toString()} 
                value={position} 
                onChange={(e) => {
                    setPosition(parseInt(e.target.value))
                }} 
            />
        </div>
    )
}