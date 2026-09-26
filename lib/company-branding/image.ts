import sharp from "sharp";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export async function normalizeLogo(file: File): Promise<Buffer> {
  if (!file.size || file.size > MAX_LOGO_BYTES) throw new Error("Choose an image up to 2 MB.");
  const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000, animated: false });
  const metadata = await image.metadata();
  if (!metadata.format || !["png", "jpeg", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error("Choose a static PNG, JPEG or WebP image.");
  // Decode, normalize orientation and re-encode. Metadata and original file names are discarded.
  return image.rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
}
