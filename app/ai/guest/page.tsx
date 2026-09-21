import type { Metadata } from "next";
import GuestAIClient from "@/components/ai-workspace/GuestAIClient";
export const metadata:Metadata={title:"RYTHM AI Guest",robots:{index:false,follow:false}};
export default function GuestAIPage(){return <GuestAIClient/>;}
