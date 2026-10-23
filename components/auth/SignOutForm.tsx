"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function SignOutForm({ className, title }: { className?: string; title?: string }) {
  const [pending, setPending] = useState(false);
  return <form action="/auth/logout" method="post" onSubmit={event => {
    if (pending) { event.preventDefault(); return; }
    setPending(true);
  }}>
    <Button className={className} title={title} type="submit" loading={pending} loadingLabel="Signing out…">
      <span className="product-signout-label">Sign out</span><span aria-hidden="true">↗</span>
    </Button>
  </form>;
}
