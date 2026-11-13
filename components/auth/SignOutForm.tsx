"use client";

import { Button } from "@/components/ui/Button";

export function SignOutForm({ className, title }: { className?: string; title?: string }) {
  // Native document submission: do not disable or rename the submit button
  // during onSubmit. The server route bounds revocation and always clears the
  // current browser session even if remote auth is unavailable.
  return <form action="/auth/logout" method="post">
    <Button className={className} title={title ?? "Sign out"} aria-label="Sign out" type="submit">
      <span className="product-signout-label">Sign out</span><span aria-hidden="true">↗</span>
    </Button>
  </form>;
}
