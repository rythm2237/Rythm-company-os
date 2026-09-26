"use client";
import Image from "next/image";
import { useState } from "react";
export default function CompanyLogo({ organizationId, name, version, size = 44 }: { organizationId: string; name: string; version?: string | null; size?: number }) {
  const src = version ? `/api/company-logo/${encodeURIComponent(organizationId)}?v=${encodeURIComponent(version)}` : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <span className="company-logo" style={{ width: size, height: size }}>
    {src && src !== failedSrc ? <Image src={src} alt={`${name} logo`} width={size} height={size} unoptimized onError={() => setFailedSrc(src)} /> : <span role="img" aria-label={`${name} company initials`}>{name.trim().slice(0, 2).toUpperCase() || "CO"}</span>}
  </span>;
}
