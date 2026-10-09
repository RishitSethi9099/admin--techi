"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Edit3, Loader2, Plus } from "lucide-react";
import { saveBillboard } from "@/lib/actions/content";
import { uploadFromBrowser } from "@/lib/browser-upload";
import type { AppRole, ApprovalStatus, Club, EventSlot } from "@/lib/supabase/types";

const VIDEO_MAX_BYTES = 7 * 1024 * 1024;
// Videos are capped at 7 MB to keep storage small and the 3D city smooth. Posters have no size cap.
const RATIO_TOLERANCE = 0.08;

function closeTo(value: number, target: number) {
  return Math.abs(value - target) <= RATIO_TOLERANCE;
}

function slotLabel(slot: EventSlot) {
  return slot.event_tier === "major" ? "Major event video" : "Minor event poster";
}

export function BillboardForm({
  role,
  visibleClubs,
  assignedClub,
  slot,
  submission,
  collabNote
}: {
  role: AppRole;
  visibleClubs: Club[];
  assignedClub: Club | null;
  slot: EventSlot;
  submission?: { status: ApprovalStatus; message: string } | null;
  /** "Collab with EIS": shared with the partner club, either side can upload */
  collabNote?: string | null;
}) {
  const type = slot.required_media_type;
  const [selectedClubId, setSelectedClubId] = useState(slot.club_id);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const [fileOk, setFileOk] = useState(true);
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(!submission);
  const formRef = useRef<HTMLFormElement>(null);
  const canChooseClub = role === "super_admin" || role === "event_ops";
  const selectedClub = visibleClubs.find((club) => club.id === selectedClubId) ?? assignedClub ?? slot.clubs ?? null;


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fileOk || isSubmitting) return;
    setIsSubmitting(true);
    setState(null);
    const formData = new FormData(event.currentTarget);
    const file = formData.get("media_file");
    let result: { ok: boolean; message: string };
    try {
      if (file instanceof File && file.size > 0) {
        const clubId = String(formData.get("club_id") || "");
        formData.set("media_url", await uploadFromBrowser("billboard-media", clubId, file));
        formData.delete("media_file");
      }
      result = await saveBillboard(null, formData);
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : "Could not upload. Check your connection and try again." };
    }
    setState(result);
    setIsSubmitting(false);
    if (result.ok) {
      formRef.current?.reset();
      setFileMessage(null);
      setFileOk(true);
      setIsEditing(false);
    }
  }
  const statusMessage = state?.ok ? state.message : submission?.message;
  const statusTone =
    state?.ok || submission?.status === "pending" || submission?.status === "approved"
      ? "success"
      : submission?.status === "rejected"
        ? "error"
        : null;

  const specs = useMemo(() => {
    if (type === "video") {
      return "Upload an MP4 video under 7 MB. Any shape works; wide (16:9) fills the screen best.";
    }
    return "Upload a poster image (PNG/JPG/WebP, any size). Best as tall 1:2 or wide 2:1.";
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
        setFileMessage(`Video is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under 7 MB (compress it, e.g. with HandBrake).`);
        return;
      }
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        // any shape is fine: the big screens fit the whole video in
        setFileMessage("Video looks good: MP4 under 7 MB.");
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
        // allowed, just a heads-up: the website's screens are tall 1:2 or wide 2:1, so other shapes get cropped
        setFileMessage("Poster accepted. Tip: tall 1:2 or wide 2:1 fits the website's screens best; other shapes get their edges cropped.");
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
    <div className="grid gap-3 rounded-2xl border border-border bg-white p-4">
      <div className="rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">{slotLabel(slot)}</div>
        <div className="mt-1 text-lg font-semibold text-foreground">{slot.event_name}</div>
        <div className="text-sm text-muted">{selectedClub?.name ?? slot.clubs?.name ?? "Assigned club"}</div>
        {collabNote ? (
          <div className="mt-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {collabNote} · shared, either club can upload
          </div>
        ) : null}
      </div>

      {statusMessage && !isEditing ? (
        <div className={statusTone === "error" ? "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" : "rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"}>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">{statusMessage}</div>
              <div className="mt-1 text-xs">You can edit and resubmit this slot if you need to change the upload.</div>
            </div>
          </div>
        </div>
      ) : null}

      {!isEditing ? (
        <button type="button" onClick={() => setIsEditing(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 font-semibold text-foreground">
          <Edit3 className="h-4 w-4" /> Edit submission
        </button>
      ) : (
        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3">
          {canChooseClub ? (
            <select name="club_id" required value={selectedClubId} onChange={(event) => setSelectedClubId(event.target.value)} className="h-11 rounded-xl border border-border px-3">
              {visibleClubs.map((club) => (
                <option key={club.id} value={club.id}>{club.short_name ?? club.name}</option>
              ))}
            </select>
          ) : (
            <input type="hidden" name="club_id" value={slot.club_id} />
          )}
          <input type="hidden" name="event_slot_id" value={slot.id} />
          <input type="hidden" name="title" value={slot.event_name} />
          <input type="hidden" name="type" value={type} />

          <label className="rounded-xl border border-dashed border-border bg-white px-4 py-4 text-sm text-muted">
            <span className="mb-1 block font-medium text-foreground">Upload {type === "video" ? "video" : "poster"} for {slot.event_name}</span>
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
          <textarea name="about_club" required placeholder="About the club or event" className="min-h-28 rounded-xl border border-border px-3 py-2" />
          {role === "super_admin" ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input name="display_order" type="number" defaultValue={slot.event_number} min={0} placeholder="Display order" className="h-11 rounded-xl border border-border px-3" />
              <label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm">
                <input type="checkbox" name="active" defaultChecked /> Active
              </label>
            </div>
          ) : (
            <>
              <input type="hidden" name="display_order" value={slot.event_number} />
              <input type="hidden" name="active" value="" />
            </>
          )}
          {state && !state.ok ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>
          ) : null}
          <button disabled={!fileOk || isSubmitting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Plus className="h-4 w-4" /> Submit {type === "video" ? "video" : "poster"}</>}
          </button>
        </form>
      )}
    </div>
  );
}






