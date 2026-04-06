import { Trash } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { hashToRange } from '@/lib/utils'


const removeNumberOne = (num: number) => {
    if (num === 1) {
        return ''
    }
    
    return '_' + num.toString()
}



export default function FaceRow({ 
    name, 
    allFaces, 
    currentFaces,
    onSubmit,
}: { 
    name: string, 
    allFaces: Set<string>, 
    currentFaces: Set<string>,
    onSubmit?: (name: string, oldName: string) => void,
}) {
    
    const [nameVal, setNameVal] = useState(name)

    return (
        <Popover>
            <PopoverTrigger asChild>
                <div key={name} className="flex items-center justify-between py-2 pl-2 pr-2.5 rounded cursor-pointer hover:bg-neutral-700/50">
                    <div className="flex gap-5 items-center">
                        <span className={cn(
                            "material-symbols-outlined px-2.5 py-2 rounded flex items-center justify-center text-4xl!",
                            currentFaces.has(name) ? 'bg-teal-600' : "bg-neutral-600"
                        )}>
                            face{removeNumberOne(hashToRange(name, 6))}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">{name}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                        <Button className="cursor-pointer" variant="destructive" size="icon">
                            <Trash />
                        </Button>
                    </div>
                </div>
            </PopoverTrigger>
            <PopoverContent  side="top" className="w-sm">
                <form onSubmit={(e) => {
                    e.preventDefault()

                    if (onSubmit) {
                        onSubmit(nameVal, name)
                    }
                }}>
                    <FieldSet>
                        <FieldLegend>{name}</FieldLegend>
                        <FieldDescription>Edit the name and assign the character to the name.</FieldDescription>
                        <FieldGroup>
                            <Field>
                                <FieldLabel>Name</FieldLabel>
                                <Input name="name" value={nameVal} onChange={(e) => setNameVal(e.target.value)} placeholder="Name" />
                            </Field>
                            <Field>
                                <FieldLabel>Assign Character</FieldLabel>
                                <Select name="character" defaultValue={name} onValueChange={(value) => setNameVal(value)}>
                                    <SelectTrigger className='grow'>
                                        <SelectValue placeholder="Select a character" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {
                                            [...allFaces].map((character) => (
                                                <SelectItem key={character} value={character}>{character}</SelectItem>
                                            ))
                                        }
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field className='justify-end mt-2' orientation="horizontal">
                                <Button type="submit" size="sm" variant="default">Submit</Button>
                                <Button size="sm" variant="outline">Cancel</Button>
                            </Field>
                        </FieldGroup>
                    </FieldSet>
                </form>
            </PopoverContent>
      </Popover>



        
    )
}