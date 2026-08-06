"use client";

import { useState } from "react";

type Props = {
  agentCode: string;
  avatarUrl: string | null;
  alt: string;
  className?: string;
};

export function AgentPortrait({ agentCode, avatarUrl, alt, className }: Props) {
  const [failed, setFailed] = useState(false);
  const src = avatarUrl && !failed
    ? `/api/agent-avatar?url=${encodeURIComponent(avatarUrl)}`
    : null;

  if (!src) {
    return <div className={className} aria-label={`${alt} portrait placeholder`}>{agentCode}</div>;
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
