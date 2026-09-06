import { BOARDROOM_ROOM_SCENE } from "../../(boardroom-preview)/boardroom-preview/roomSceneData";

const DATA_URI_PREFIX = "data:image/webp;base64,";

export const dynamic = "force-static";

export function GET() {
  const encoded = BOARDROOM_ROOM_SCENE.startsWith(DATA_URI_PREFIX)
    ? BOARDROOM_ROOM_SCENE.slice(DATA_URI_PREFIX.length)
    : BOARDROOM_ROOM_SCENE;
  const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));

  return new Response(bytes.buffer, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
