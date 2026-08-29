"use client";

import { useState } from "react";

type Props = {
  agentCode: string;
  avatarUrl: string | null;
  alt: string;
  className?: string;
};

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AI";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function AgentPortrait({ agentCode, avatarUrl, alt, className }: Props) {
  const [failed, setFailed] = useState(false);
  const src = avatarUrl && !failed
    ? `/api/agent-avatar?url=${encodeURIComponent(avatarUrl)}`
    : null;

  if (!src) {
    return (
      <div className={className} data-fallback="true" aria-label={`${alt} portrait placeholder`}>
        <span>{initials(alt)}</span>
        <small>{agentCode}</small>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
    />
  );
}
