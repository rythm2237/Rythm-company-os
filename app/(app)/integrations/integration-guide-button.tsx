"use client";

import { Button } from "@/components/ui/Button";

type Props = { providerKey?: string; label?: string; className?: string };

export function IntegrationGuideButton({ providerKey, label = "Setup guide", className = "secondary-button" }: Props) {
  return <Button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent("rythm:integration-guide", { detail: { providerKey, open: true, step: 0 } }))}>{label}</Button>;
}
