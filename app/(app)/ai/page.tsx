import type { Metadata } from "next";
import AIWorkspaceClient from "@/components/ai-workspace/AIWorkspaceClient";

export const metadata: Metadata = { title: "RYTHM AI", robots: { index: false, follow: false } };
export default function AIWorkspacePage() { return <AIWorkspaceClient />; }
