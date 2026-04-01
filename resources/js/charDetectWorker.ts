import type { FaceFrame, IdentityBox } from '@/types/video';

let names: string[] = [
    'John',
    'Jane',
    'Jim',
    'Jill',
    'Jack',
    'Taylor',
    'Tom',
    'Tyler',
    'Trent',
    'Trevor',
    'Tyson',
    'Trenton',
]

let fs: FaceFrame[] = []
let namedBoxes: IdentityBox[] = []

addEventListener('message', (event: MessageEvent<FaceFrame>) => {
    const { faces, time }: FaceFrame = event.data;
    fs.push({ faces, time })

    if (faces.length > 0) {
        faces.forEach((face) => {
            const name = names[Math.floor(Math.random() * names.length)]
            namedBoxes.push({
                ...face,
                name
            })
        })
        
        postMessage({
            time,
            boxes: namedBoxes
        })

        namedBoxes = []
    }

    // return {
    //     time,
    //     boxes: namedBoxes
    // }
    // if (fs.length >= 100) {
    //     postMessage(fs);
    //     fs = [];
    // }
});