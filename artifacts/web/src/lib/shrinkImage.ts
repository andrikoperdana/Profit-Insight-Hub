// Shrink large receipt photos before they're base64-encoded and sent to the
// server — the web twin of artifacts/mobile/lib/shrinkImage.ts. Phone/camera
// photos easily reach 4–12 MB, which blows past the server's evidence cap and
// uploads slowly; images above the threshold are downscaled to a bounded long
// edge and re-encoded as JPEG. PDFs and already-small images pass through
// untouched. Keep the constants in sync with the mobile helper so a receipt
// looks the same no matter where it was submitted from.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.7;
// Below this size the re-encode isn't worth the quality loss — receipts stay
// perfectly legible well above it.
const SHRINK_THRESHOLD_BYTES = 500 * 1024;

/**
 * Returns a smaller JPEG `File` when the input is a large image, or the
 * original file untouched (non-images, small images, or any failure —
 * shrinking must never block submitting a claim).
 */
export async function shrinkImageFileIfNeeded(file: File): Promise<File> {
  if (!/^image\//i.test(file.type)) return file;
  if (file.size <= SHRINK_THRESHOLD_BYTES) return file;

  try {
    // createImageBitmap honors EXIF orientation in modern browsers, so
    // portrait phone photos stay upright after the redraw.
    const bitmap = await createImageBitmap(file);
    try {
      const long = Math.max(bitmap.width, bitmap.height);
      const scale = long > MAX_DIMENSION ? MAX_DIMENSION / long : 1;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
      );
      if (!blob) return file;
      // Nothing gained (e.g. an already-optimized small-dimension photo):
      // keep the original bytes and name.
      if (blob.size >= file.size) return file;

      const baseName = file.name.replace(/\.[a-z0-9]+$/i, "");
      return new File([blob], `${baseName || "receipt"}.jpg`, { type: "image/jpeg" });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
