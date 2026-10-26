import {NextResponse} from "next/server";
import {inspectW01Boundary} from "@/lib/qa/w01-boundary";
export const dynamic="force-dynamic";
export function GET(){const report=inspectW01Boundary(process.env);if(!report)return new NextResponse(null,{status:404});return NextResponse.json(report,{status:report.safe?200:503,headers:{"Cache-Control":"no-store"}});}
