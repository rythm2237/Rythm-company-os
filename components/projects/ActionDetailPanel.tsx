"use client";
import {useRouter} from "next/navigation";
import type {ReactNode} from "react";
import {ContextPanel} from "./ContextPanel";
export function ActionDetailPanel({title,closeHref,children}:{title:string;closeHref:string;children:ReactNode}){
 const router=useRouter();return <ContextPanel title={title} onClose={()=>router.replace(closeHref,{scroll:false})}>{children}</ContextPanel>;
}
