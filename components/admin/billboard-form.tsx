"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { saveBillboard } from "@/lib/actions/content";
import type { AppRole, Club } from "@/lib/supabase/types";

const VIDEO_MAX_BYTES = 3 * 1024 * 1024;
const RATIO_TOLERANCE = 0.08;

function closeTo(value: number, target: number) {
  return Math.abs(value - target) <= RATIO_TOLERANCE;
}

export function BillboardForm({
  role,
  visibleClubs,
  assignedClub
}: {
  role: AppRole;
  visibleClubs: Club[];
  assignedClub: Club | null;
}) {
  const [type, setType] = useState<"poster" | "video">("poster");
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const [fileOk, setFileOk] = useState(true);
  const isClubAdmin = role === "club_admin";
  const canChooseClub = role === "super_admin" || role === "event_ops";

  const specs = useMemo(() => {
    if (type === "video") {
      return "Major event video: MP4, 16:9, about 10 seconds, under 3 MB if possible.";
    }
    return "Club poster: upload either a tall 1:2 poster or a wide 2:1 poster.";
  }, [type]);

  async function validateFile(file: File | undefined) {
    setFileMessage(null);
    setFileOk(true);
    if (!file) return;

    if (type === "video") {
      if (file.type !== "video/mp4") {
        setFileOk(false);
        setFileMessage("Video must be MP4.");
        return;
      }
      if (file.size > VIDEO_MAX_BYTES) {
        setFileOk(false);
        setFileMessage("Video is over 3 MB. Compress it before uploading.");
        return;
      }
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        const ratio = video.videoWidth / video.videoHeight;
        const duration = video.duration;
        if (!closeTo(ratio, 16 / 9)) {
          setFileOk(false);
          setFileMessage("Video must be 16:9.");
          return;
        }
        if (duration < 8 || duration > 12) {
          setFileOk(false);
          setFileMessage("Video should be about 10 seconds. Keep it between 8 and 12 seconds.");
          return;
        }
        setFileMessage("Video looks good: MP4, 16:9, around 10 seconds, under 3 MB.");
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        setFileOk(false);
        setFileMessage("Could not read video metadata. Try another MP4.");
      };
      video.src = url;
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setFileOk(false);
      setFileMessage("Poster must be PNG, JPG, or WebP.");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = image.width / image.height;
      if (!closeTo(ratio, 1 / 2) && !closeTo(ratio, 2 / 1)) {
        setFileOk(false);
        setFileMessage("Poster must be tall 1:2 or wide 2:1.");
        return;
      }
      setFileMessage(closeTo(ratio, 1 / 2) ? "Poster looks good: tall 1:2." : "Poster looks good: wide 2:1.");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setFileOk(false);
      setFileMessage("Could not read poster dimensions. Try another image.");
    };
    image.src = url;
  }

  return (
    <form action={saveBillboard} className="grid gap-3">
      {canChooseClub ? (
        <select name="club_id" required className="h-11 rounded-xl border border-border px-3">
          <option value="">Select club</option>
          {visibleClubs.map((club) => (
            <option key={club.id} value={club.id}>{club.short_name ?? club.name}</option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="club_id" value={assignedClub?.id ?? ""} />
      )}
      <input name="title" required placeholder="Promo title" className="h-11 rounded-xl border border-border px-3" />
      <select name="type" value={type} onChange={(event) => setType(event.target.value as "poster" | "video")} className="h-11 rounded-xl border border-border px-3">
        <option value="poster">Poster</option>
        <option value="video">Video</option>
      </select>
      <label className="rounded-xl border border-dashed border-border bg-white px-4 py-4 text-sm text-muted">
        <span className="mb-1 block font-medium text-foreground">Upload {type === "video" ? "major event video" : "club poster"}</span>
        <span className="mb-3 block text-xs text-muted">{specs}</span>
        <input
          name="media_file"
          type="file"
          accept={type === "video" ? "video/mp4" : "image/png,image/jpeg,image/webp"}
          onChange={(event) => validateFile(event.target.files?.[0])}
          className="block w-full text-sm"
        />
      </label>
      {fileMessage ? (
        <p className={fileOk ? "rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700" : "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"}>
          {fileMessage}
        </p>
      ) : null}
      <input name="media_url" type="url" placeholder="Optional media URL fallback" className="h-11 rounded-xl border border-border px-3" />
      <textarea name="about_club" required placeholder="About the club" className="min-h-28 rounded-xl border border-border px-3 py-2" />
      {role === "super_admin" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input name="display_order" type="number" defaultValue={0} min={0} placeholder="Display order" className="h-11 rounded-xl border border-border px-3" />
          <label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm">
            <input type="checkbox" name="active" /> Active
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="display_order" value="0" />
          <input type="hidden" name="active" value="" />
        </>
      )}
      <button disabled={!fileOk} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        <Plus className="h-4 w-4" /> Submit
      </button>
    </form>
  );
}
