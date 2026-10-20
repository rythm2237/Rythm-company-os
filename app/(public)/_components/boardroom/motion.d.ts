export interface OriginalMotionOptions { imageUrl?:string; motion?:number; onPlayChange?:(playing:boolean)=>void; }
export interface OriginalMotion { ready:Promise<void>; readonly playing:boolean; readonly time:number; setPlaying(value:boolean):void; seek(seconds:number):void; dispose():void; }
export function mountOriginalMotion(host:HTMLElement,options?:OriginalMotionOptions):OriginalMotion;
export function drawBoardroomFrame(ctx:CanvasRenderingContext2D,image:CanvasImageSource,time:number,options?:{width?:number;height?:number;motion?:number}):void;
