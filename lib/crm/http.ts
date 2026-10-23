import {NextResponse} from "next/server";
export function crmResponse(data:unknown,status=200) {return NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
export async function crmJson(request:Request):Promise<Record<string,unknown>> {
 if(request.headers.get("origin")!==new URL(request.url).origin)throw new Error("Invalid origin");
 if(!request.headers.get("content-type")?.startsWith("application/json"))throw new Error("JSON required");
 const reader=request.body?.getReader();if(!reader)throw Error("Missing body");
 let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128000){await reader.cancel();throw Error("Request too large");}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const parsed:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("JSON object required");return parsed as Record<string,unknown>;
}
