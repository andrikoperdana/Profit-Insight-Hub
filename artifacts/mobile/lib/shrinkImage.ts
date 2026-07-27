import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Image } from "react-native";

// Shrink large receipt photos before they're base64-encoded and sent to the
// server. Phone cameras easily produce 4–12 MB photos that blow past the
// server's 8 MB evidence cap (and upload slowly in the field), so images above
// the threshold are downscaled to a bounded long edge and re-encoded as JPEG.
// PDFs and already-small images pass through untouched.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.7;
// Below this size the re-encode isn't worth the quality loss — receipts stay
// perfectly legible well above it.
const SHRINK_THRESHOLD_BYTES = 500 * 1024;

export type ShrinkResult = {
  uri: string;
  mime: string;
  name: string;
  resized: boolean;
};

// RN's Image.getSize is callback-based; failures resolve to null so a broken
// probe never blocks attaching the original file.
function getImageSize(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}

export async function shrinkImageIfNeeded(asset: {
  uri: string;
  mime: string;
  name: string;
  size: number | null | undefined;
  width?: number | null;
  height?: number | null;
}): Promise<ShrinkResult> {
  const passthrough: ShrinkResult = {
    uri: asset.uri,
    mime: asset.mime,
    name: asset.name,
    resized: false,
  };
  if (!/^image\//i.test(asset.mime)) return passthrough;
  const knownSmall =
    typeof asset.size === "number" && asset.size <= SHRINK_THRESHOLD_BYTES;
  if (knownSmall) return passthrough;

  const dims =
    asset.width && asset.height
      ? { width: asset.width, height: asset.height }
      : await getImageSize(asset.uri);

  const knownBig =
    typeof asset.size === "number" && asset.size > SHRINK_THRESHOLD_BYTES;
  const needsResize = !!dims && Math.max(dims.width, dims.height) > MAX_DIMENSION;
  // Unknown byte size AND small (or unknown) dimensions: nothing to gain.
  if (!needsResize && !knownBig) return passthrough;

  const actions: { resize: { width?: number; height?: number } }[] = [];
  if (needsResize && dims) {
    // Cap the long edge; manipulateAsync preserves aspect ratio when only one
    // dimension is given.
    actions.push(
      dims.width >= dims.height
        ? { resize: { width: MAX_DIMENSION } }
        : { resize: { height: MAX_DIMENSION } },
    );
  }

  try {
    const result = await manipulateAsync(asset.uri, actions, {
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    const baseName = asset.name.replace(/\.[a-z0-9]+$/i, "");
    return {
      uri: result.uri,
      mime: "image/jpeg",
      name: `${baseName || "receipt"}.jpg`,
      resized: true,
    };
  } catch {
    // If the shrink fails for any reason, attach the original rather than
    // blocking the claim — the existing size checks still apply downstream.
    return passthrough;
  }
}
