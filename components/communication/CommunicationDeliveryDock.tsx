"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type QueueItem = {
  id: string;
  thread_id: string;
  subject: string | null;
  sender_email: string | null;
  recipients: unknown;
  created_at: string;
  approved_at: string | null;
};

type QueueResponse = {
  ok: boolean;
  configured?: boolean;
  queue?: QueueItem[];
  error?: string;
  status?: string;
  executionId?: string;
  approvalId?: string | null;
  message?: string;
};

function recipientText(value: unknown) {
  if (!Array.isArray(value)) return "Unknown recipient";
  const recipients = value.filter(
    (item): item is string => typeof item === "string",
  );
  return recipients.join(", ") || "Unknown recipient";
}

export default function CommunicationDeliveryDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    approvalId?: string | null;
  } | null>(null);
  const [proposedIds, setProposedIds] = useState<Set<string>>(() => new Set());

  const active = pathname === "/communication";

  async function loadQueue() {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/communication/outbound/resend", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response
        .json()
        .catch(() => null)) as QueueResponse | null;
      if (!response.ok || !data?.ok)
        throw new Error(data?.error || "Delivery queue could not be loaded.");
      setConfigured(Boolean(data.configured));
      setQueue(data.queue ?? []);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Delivery queue could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const visible =
    active &&
    (loading || error || notice || configured === false || queue.length > 0);
  const title = useMemo(() => {
    if (configured === false) return "Outbound transport pending";
    if (queue.length)
      return `${queue.length} approved email${queue.length === 1 ? "" : "s"} ready`;
    return "Outbound delivery";
  }, [configured, queue.length]);

  async function send(messageId: string) {
    if (!configured || sendingId) return;
    setSendingId(messageId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/communication/outbound/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
        credentials: "same-origin",
      });
      const data = (await response
        .json()
        .catch(() => null)) as QueueResponse | null;
      if (!response.ok || !data?.ok)
        throw new Error(data?.error || "Email delivery failed.");
      if (data.status === "waiting_approval" || data.status === "simulated") {
        setProposedIds((current) => new Set([...current, messageId]));
        setNotice({
          message:
            data.message || "The governed delivery proposal was recorded.",
          approvalId: data.approvalId,
        });
      } else await loadQueue();
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Email delivery failed.",
      );
    } finally {
      setSendingId(null);
    }
  }

  if (!visible) return null;

  return (
    <aside
      aria-live="polite"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 80,
        width: "min(390px, calc(100vw - 32px))",
        borderRadius: 18,
        border: "1px solid rgba(15, 31, 61, 0.14)",
        background: "rgba(255,255,255,0.97)",
        boxShadow: "0 20px 60px rgba(15, 31, 61, 0.18)",
        padding: 16,
        color: "#10203d",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              opacity: 0.65,
            }}
          >
            Governed delivery
          </div>
          <strong style={{ display: "block", marginTop: 3, fontSize: 16 }}>
            {title}
          </strong>
        </div>
        <button
          type="button"
          onClick={() => void loadQueue()}
          disabled={loading}
          style={{
            border: "1px solid rgba(15,31,61,.15)",
            background: "white",
            borderRadius: 10,
            padding: "7px 10px",
            cursor: "pointer",
          }}
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {configured === false ? (
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#78520b",
          }}
        >
          Receiving is live. Sending is fail-closed until the Resend API key is
          configured in Production.
        </p>
      ) : null}

      {queue.length ? (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {queue.map((item) => (
            <div
              key={item.id}
              style={{
                border: "1px solid rgba(15,31,61,.10)",
                borderRadius: 12,
                padding: 11,
                background: "#f8faff",
              }}
            >
              <strong style={{ display: "block", fontSize: 14 }}>
                {item.subject || "(no subject)"}
              </strong>
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontSize: 12,
                  opacity: 0.7,
                }}
              >
                {item.sender_email || "Company mailbox"} →{" "}
                {recipientText(item.recipients)}
              </span>
              <button
                type="button"
                disabled={
                  !configured || Boolean(sendingId) || proposedIds.has(item.id)
                }
                onClick={() => void send(item.id)}
                style={{
                  marginTop: 9,
                  width: "100%",
                  border: 0,
                  borderRadius: 10,
                  padding: "9px 12px",
                  fontWeight: 800,
                  cursor:
                    configured && !sendingId && !proposedIds.has(item.id)
                      ? "pointer"
                      : "not-allowed",
                  background: configured ? "#10203d" : "#d9deea",
                  color: configured ? "white" : "#6b7280",
                }}
              >
                {sendingId === item.id
                  ? "Preparing…"
                  : proposedIds.has(item.id)
                    ? "Gateway approval pending"
                    : configured
                      ? "Propose governed delivery"
                      : "Resend not configured"}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <p style={{ margin: "10px 0 0", color: "#a12626", fontSize: 12 }}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            background: "#eef5ff",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <strong>Pending Gateway step</strong>
          <span style={{ display: "block" }}>{notice.message}</span>
          {notice.approvalId ? (
            <button
              type="button"
              className="secondary-button"
              style={{ marginTop: 8 }}
              onClick={() =>
                router.push(`/approvals?approval=${notice.approvalId}`)
              }
            >
              Review exact approval
            </button>
          ) : null}
        </div>
      ) : null}
      <p style={{ margin: "10px 0 0", fontSize: 11, opacity: 0.62 }}>
        Only Human-approved messages can be delivered. Auto-send remains locked.
      </p>
    </aside>
  );
}
