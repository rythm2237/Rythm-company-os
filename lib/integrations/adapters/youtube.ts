import "server-only";
import type { ConnectionVerification, ProviderConnectionAdapter } from "../connections/types";

type Json = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

async function verifyYouTube(accessToken: string): Promise<ConnectionVerification> {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics,contentDetails&mine=true&maxResults=50",
    {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const error = object(body.error);
    const message = text(error.message) || text(body.error_description);
    const base = response.status === 401
      ? "YouTube rejected the OAuth credential"
      : response.status === 403
        ? "YouTube rejected the requested permission"
        : `YouTube verification failed (${response.status})`;
    const failure = new Error(message ? `${base}: ${message}` : `${base}.`) as Error & { status?: number };
    failure.status = response.status;
    throw failure;
  }

  const channels = list(body.items);
  if (!channels.length) throw new Error("YouTube returned no channel owned by the authorized account.");

  const resources = channels.map((channel) => {
    const id = text(channel.id);
    const snippet = object(channel.snippet);
    const statistics = object(channel.statistics);
    const contentDetails = object(channel.contentDetails);
    const relatedPlaylists = object(contentDetails.relatedPlaylists);
    return {
      resourceType: "youtube_channel",
      resourceId: id,
      resourceName: text(snippet.title) || id,
      metadata: {
        custom_url: text(snippet.customUrl) || null,
        published_at: text(snippet.publishedAt) || null,
        country: text(snippet.country) || null,
        subscriber_count: text(statistics.subscriberCount) || null,
        video_count: text(statistics.videoCount) || null,
        view_count: text(statistics.viewCount) || null,
        uploads_playlist_id: text(relatedPlaylists.uploads) || null,
      },
    };
  }).filter((resource) => Boolean(resource.resourceId));

  if (!resources.length) throw new Error("YouTube returned a channel without a stable channel ID.");

  return {
    accountRef: resources[0].resourceId,
    grantedScopes: ["youtube.readonly"],
    resources,
    detail: {
      channel_count: resources.length,
      verification_endpoint: "youtube/v3/channels?mine=true",
      readonly: true,
    },
  };
}

export const youtubeAdapter: ProviderConnectionAdapter = {
  providerKey: "youtube",
  authorization: "token",
  verifyCredential: verifyYouTube,
  async discoverResources(token) {
    return (await verifyYouTube(token)).resources;
  },
  async healthCheck(token) {
    try {
      await verifyYouTube(token);
      return { healthy: true, code: "verified" };
    } catch (error) {
      return {
        healthy: false,
        code: (error as { status?: number }).status === 401 ? "reauth_required" : "provider_error",
      };
    }
  },
};
