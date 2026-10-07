"use client";

// Posters only show on screens up to ~768 px and on phones, but clubs upload 3-15 MB originals
// that load slowly or fail on phones. Shrink in the browser before upload: at most 2048 px on the
// longest side, high-quality JPEG. Small files are left exactly as they are.
const MAX_SIDE = 2048;
const KEEP_IF_UNDER = 1.2 * 1024 * 1024;

function loadBitmap(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read the image.")); };
    img.src = url;
  });
}

/** Returns a smaller JPEG blob, or null when the image is already small enough (or can't be read). */
export async function shrinkImage(blob: Blob): Promise<Blob | null> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(blob.type)) return null;
  let img: HTMLImageElement;
  try { img = await loadBitmap(blob); } catch { return null; }
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  if (scale === 1 && blob.size <= KEEP_IF_UNDER) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000"; // transparent PNG areas become black, matching the dark screens
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  return out && out.size < blob.size ? out : null;
}
