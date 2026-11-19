import {NextResponse} from "next/server";
import {inspectW01Runtime} from "@/lib/qa/w01-boundary";
export const dynamic="force-dynamic";
export async function GET(){const report=await inspectW01Runtime(process.env);if(!report)return new NextResponse(null,{status:404});return NextResponse.json(report,{status:report.safe?200:503,headers:{"Cache-Control":"no-store"}});}
