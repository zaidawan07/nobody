/** Client-side capture/optimization helpers for real media uploads. */

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];

export function imageExtensionOk(file: File): boolean {
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}
export function videoExtensionOk(file: File): boolean {
  return /\.(mp4|mov|webm|m4v)$/i.test(file.name);
}

export function validateMediaFile(file: File): { kind: "photo" | "video" } | { error: string } {
  const isImage = IMAGE_MIMES.some((m) => file.type === m) || (file.type === "" && imageExtensionOk(file));
  const isVideo = VIDEO_MIMES.some((m) => file.type === m) || (file.type === "" && videoExtensionOk(file));
  if (isImage) {
    if (!imageExtensionOk(file) && !IMAGE_MIMES.includes(file.type)) return { error: "Images must be JPEG, PNG, or WebP." };
    if (file.size > MAX_IMAGE_BYTES) return { error: "Photo too large (max 15 MB)." };
    if (file.size === 0) return { error: "That file is empty." };
    return { kind: "photo" };
  }
  if (isVideo) {
    if (!videoExtensionOk(file) && !VIDEO_MIMES.includes(file.type)) return { error: "Videos must be MP4, MOV, M4V, or WebM." };
    if (file.size > MAX_VIDEO_BYTES) return { error: "Video too large (max 250 MB)." };
    if (file.size === 0) return { error: "That file is empty." };
    return { kind: "video" };
  }
  return { error: "Unsupported format. Photos: JPEG/PNG/WebP. Videos: MP4/MOV/M4V/WebM." };
}

async function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't decode that image."));
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resize (shrink only) + recompress into a JPEG blob sized ~maxLongEdge. */
export async function optimizeImage(blob: Blob, maxLongEdge: number, quality: number): Promise<Blob> {
  const img = await loadImageFromFile(blob);
  const scale = Math.min(1, maxLongEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? blob), "image/jpeg", quality));
}

/** Extract a poster frame ~10% into the clip. Returns null when the browser can't decode it. */
export async function extractVideoPoster(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.preload = "metadata";
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, (video.duration || 2) * 0.1);
      };
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("decode failed"));
      setTimeout(() => resolve(), 3000); // don't hang on weird clips
    });
    await new Promise((r) => setTimeout(r, 80));
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(1280, video.videoWidth || 1280);
    canvas.height = Math.round((canvas.width / (video.videoWidth || 1280)) * (video.videoHeight || 720));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.72));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrink the upload a phone photograph down to a displayable asset. */
export async function optimizeImageForUpload(file: File): Promise<{ main: Blob; thumb: Blob }> {
  const main = await optimizeImage(file, 1600, 0.82);
  const thumb = await optimizeImage(file, 480, 0.7);
  return { main, thumb };
}

