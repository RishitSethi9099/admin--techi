"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// Vercel rejects requests over 4.5 MB, so files go straight from the browser to
// Supabase storage and only the link is sent to the server.
function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload";
}

export async function uploadFromBrowser(bucket: "billboard-media" | "event-posters", clubId: string, file: File) {
  if (!clubId) throw new Error("Pick a club before uploading.");
  const supabase = createSupabaseBrowserClient();
  const path = `${clubId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined
  });
  if (error) {
    if (/exceeded|too large|maximum allowed size/i.test(error.message)) throw new Error("This file is bigger than the storage allows. Try a smaller file.");
    throw new Error(`Upload failed: ${error.message}`);
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
