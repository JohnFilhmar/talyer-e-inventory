/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * The server resizes every product image to fit 800x800 and re-encodes it as
 * JPEG q80, so a 12MP phone photo arrives as ~9MB and is stored as ~90KB —
 * about 99% of the bytes are uploaded only to be discarded. On mobile upstream,
 * which is far slower and less stable than downstream, that is the difference
 * between an upload finishing in under a second and one timing out.
 *
 * ## Orientation is the trap here
 *
 * A phone writes pixels in sensor order and records "rotate 90°" in EXIF.
 * Canvas output carries **no** EXIF, so if this resized without applying the
 * orientation first, it would hand the server an image whose pixels are
 * sideways and whose tag is gone — re-introducing exactly the bug that
 * `sharp(...).rotate()` was added to fix, and this time unrecoverably, because
 * the server would have nothing left to rotate by.
 *
 * `createImageBitmap(file, { imageOrientation: 'from-image' })` is what makes
 * this safe: it applies the tag while decoding. Where that is unavailable, this
 * function **returns the original file untouched** rather than guessing — a
 * slow upload is a far better outcome than a permanently sideways photo.
 */

/**
 * Longest edge to keep. Comfortably above the server's 800px bound, so the
 * server still has real detail to work from and this stays invisible in the
 * stored result, while cutting a 12MP frame by well over an order of magnitude.
 */
const MAX_EDGE = 1600;

/** Re-encode quality. Above the server's 80, so this pass is not the limiting one. */
const JPEG_QUALITY = 0.85;

/**
 * Files below this are already cheap to send; decoding and re-encoding them
 * would burn phone battery to save nothing.
 */
const SKIP_BELOW_BYTES = 400 * 1024;

/** Only these are re-encoded. Anything else is passed through untouched. */
const DOWNSCALABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function canDownscale(): boolean {
  return (
    typeof createImageBitmap === 'function' &&
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined'
  );
}

/**
 * Returns a smaller JPEG version of `file`, or `file` itself when shrinking is
 * unnecessary, unsupported, or would not actually help.
 *
 * Never throws: every failure path returns the original, so an upload can
 * always proceed. The server remains the authority on the final size and
 * format regardless of what happens here.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!DOWNSCALABLE_TYPES.includes(file.type)) return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;
  if (!canDownscale()) return file;

  let bitmap: ImageBitmap | undefined;

  try {
    // 'from-image' applies the EXIF orientation during decode. Without it the
    // canvas would hold sideways pixels and emit them with no tag to correct by.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    const { width, height } = bitmap;
    if (width === 0 || height === 0) return file;

    // Already small enough in both dimensions — re-encoding would only lose
    // quality for no meaningful saving.
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    if (scale === 1 && file.size <= SKIP_BELOW_BYTES) return file;

    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });

    if (!blob) return file;

    // A small or already-compressed source can come out *larger* after
    // re-encoding. Sending the bigger one would defeat the entire point.
    if (blob.size >= file.size) return file;

    // Extension follows the new type, so the stored name is not misleading —
    // a PNG re-encoded to JPEG should not still be called .png.
    const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'photo';

    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    // Decode refused, canvas tainted, out of memory on a very large image —
    // in every case the original is still a valid upload.
    return file;
  } finally {
    bitmap?.close();
  }
}
