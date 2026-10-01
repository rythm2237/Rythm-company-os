"use client";

import { Button } from "@/components/ui/Button";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="admin-studio"><section className="admin-panel" role="alert"><h1>Customer data unavailable</h1><p>The request could not be completed. Your permissions may have changed, or the service may be temporarily unavailable.</p><Button onClick={reset}>Try again</Button></section></main>; }
