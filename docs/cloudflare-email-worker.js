// RYTHM Company OS — Cloudflare Email Worker

const RYTHM_ENDPOINT = "https://rythm-company-os.vercel.app/api/communication/inbound/cloudflare";

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export default {
  async email(message, env) {
    const recipient = (message.to || "").trim().toLowerCase();
    const validMailbox = /^(contact|support|sales|finance|management)\.[a-z0-9][a-z0-9-]{0,62}@rythm-os\.com$/i.test(recipient);

    if (!validMailbox) {
      message.setReject("Unknown RYTHM managed mailbox");
      return;
    }

    if (!env.RYTHM_INGEST_SECRET) {
      console.error("RYTHM_INGEST_SECRET is not configured");
      message.setReject("RYTHM mailbox temporarily unavailable");
      return;
    }

    if (message.rawSize > 3 * 1024 * 1024) {
      message.setReject("Message exceeds RYTHM inbound size limit");
      return;
    }

    const raw = await new Response(message.raw).arrayBuffer();
    const response = await fetch(RYTHM_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rythm-email-secret": env.RYTHM_INGEST_SECRET,
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        subject: message.headers.get("subject") || "(no subject)",
        messageId: message.headers.get("message-id") || null,
        rawSize: message.rawSize,
        rawBase64: arrayBufferToBase64(raw),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("RYTHM inbound ingest failed", response.status, body);
      message.setReject("RYTHM mailbox temporarily unavailable");
    }
  },
};
