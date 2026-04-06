import { useForm } from "@inertiajs/react";
import { Circle, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils";
import { Button } from "./ui/button"

export default function Dropzone({
    className = "",
    onSelect,
    onClicked
} : {
    className?: string,
    onSelect : (f: File) => void
    onClicked?: () => void
}) {

    

    const fileInput = useRef<HTMLInputElement>(null)
    const onSelectRef = useRef(onSelect)

    const [dragging, setDragging] = useState(false)

    const { data, setData } = useForm<{ file: File|null }>({
        file: null
    })

    useEffect(() => {
        onSelectRef.current = onSelect
    })

    useEffect(() => {
        if (data.file) {
            onSelectRef.current?.(data.file)
        }
    }, [data.file])

    return (
        <Empty
            className={cn(
                "h-full grow border-dashed border-2 border-foreground/20 rounded-lg",
                dragging && "border-muted-foreground",
                className
            )}
            onClick={(e) => {
                e.stopPropagation()

                if (onClicked) {
                    onClicked()
                }
            }}
            onDragEnter={(e) => {
                e.preventDefault()
                setDragging(true)
            }}
            onDragOver={(e) => {
                e.preventDefault()

                if (!dragging) {
                    setDragging(true)
                }
            }}
            onDragLeave={(e) => {
                e.preventDefault()
                setDragging(false)
            }}
            onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const dataTransfer = e.dataTransfer
                const files = [...dataTransfer.files]
                setData('file', files[0])
            }}
        >
            <EmptyHeader className="max-w-full">
                <EmptyMedia variant="icon">
                    <Upload className="size-5.5" />
                </EmptyMedia>
                <EmptyTitle>Add Media</EmptyTitle>
                <EmptyDescription>
                    Drag and drop video files or record a video.
                </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                <div className="flex gap-2">
                    
                    <Button 
                        size="sm" 
                        className="cursor-pointer" 
                        type="button" 
                        onClick={() => fileInput.current?.click()}
                    >
                        Browse
                    </Button>
                    <Button size="sm" variant="outline">
                        <Circle className="size-3 fill-red-500 stroke-transparent" />
                        Record Video
                    </Button>
                </div>
                <input 
                    ref={fileInput} 
                    className="hidden" 
                    type="file"
                    onChange={(e) => {
                        if (e.target.files !== null) {
                            const files = [...e.target.files]
                            setData('file', files[0])
                        } else {
                            setData('file', null)
                        }
                    }} 
                />
            </EmptyContent>
            {/* <Button
                variant="link"
                asChild
                className="text-muted-foreground"
                size="sm"
            >
                <a href="#">
                Learn More <ArrowUpRightIcon />
                </a>
            </Button> */}
        </Empty>
    )
}