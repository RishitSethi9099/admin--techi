"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { shrinkImage } from "@/lib/image-shrink";

// Vercel rejects requests over 4.5 MB, so files go straight from the browser to
// Supabase storage and only the link is sent to the server.
function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload";
}

export async function uploadFromBrowser(bucket: "billboard-media" | "event-posters", clubId: string, file: File) {
  if (!clubId) throw new Error("Pick a club before uploading.");
  const supabase = createSupabaseBrowserClient();
  // posters: shrink big images first so the website loads them quickly (videos are left alone)
  const small = file.type.startsWith("image/") ? await shrinkImage(file) : null;
  const body: Blob = small ?? file;
  const name = small ? safeFileName(file.name).replace(/\.(png|jpe?g|webp)$/i, "") + ".jpg" : safeFileName(file.name);
  const path = `${clubId}/${Date.now()}-${name}`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    cacheControl: "3600",
    upsert: false,
    contentType: (small ? "image/jpeg" : file.type) || undefined
  });
  if (error) {
    if (/exceeded|too large|maximum allowed size/i.test(error.message)) throw new Error("This file is bigger than the storage allows. Try a smaller file.");
    throw new Error(`Upload failed: ${error.message}`);
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Super Admin: shrink an already-uploaded poster and store the small copy next to it. Returns the new link, or null if it was already small. */
export async function optimiseUploadedPoster(url: string): Promise<string | null> {
  const m = /\/storage\/v1\/object\/public\/(billboard-media|event-posters)\/(.+)$/.exec(url);
  if (!m) return null;
  const [, bucket, path] = m;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not download ${path}`);
  const small = await shrinkImage(await res.blob());
  if (!small) return null;
  const folder = path.split("/")[0];
  const base = decodeURIComponent(path.split("/").pop() || "poster").replace(/\.(png|jpe?g|webp)$/i, "");
  const newPath = `${folder}/${Date.now()}-${safeFileName(base)}-small.jpg`;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(bucket).upload(newPath, small, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(newPath).data.publicUrl;
}
