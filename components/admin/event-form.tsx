"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, Trash2, X, XCircle } from "lucide-react";
import { deleteEvent, saveEvent, type EventActionResult } from "@/lib/actions/content";
import { EventScheduleFields } from "@/components/admin/event-schedule-fields";
import { uploadFromBrowser } from "@/lib/browser-upload";
import type { Club, Event } from "@/lib/supabase/types";

export type EventSlotInfo = { id: string; club_id: string; event_name: string; event_tier: "major" | "minor" };

const POSTER_TYPES = ["image/png", "image/jpeg", "image/webp"];

function EventFields({
  event,
  visibleClubs,
  canChooseClub,
  assignedClub,
  slot,
  special,
  linkOptions,
  onPosterProblem
}: {
  event?: Event;
  visibleClubs: Club[];
  canChooseClub: boolean;
  assignedClub: Club | null;
  slot?: EventSlotInfo;
  special?: boolean;
  linkOptions?: EventSlotInfo[];
  onPosterProblem: (message: string | null) => void;
}) {
  return (
    <div className="grid min-w-0 gap-3 [&>*]:min-w-0">
      {event?.id ? <input type="hidden" name="id" value={event.id} /> : null}
      {slot ? (
        <>
          <input type="hidden" name="club_id" value={slot.club_id} />
          <input type="hidden" name="event_slot_id" value={slot.id} />
        </>
      ) : linkOptions ? (
        <label className="grid gap-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <span className="font-medium text-amber-900">Which of the club's events is this?</span>
          <select name="event_slot_id" defaultValue="" className="h-11 rounded-xl border border-border bg-white px-3">
            <option value="">Not linked yet</option>
            {linkOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.event_name} · {option.event_tier === "major" ? "Major" : "Minor"} event</option>
            ))}
          </select>
          <span className="text-xs text-amber-800">Linking decides whether it shows as a major or minor event on the website.</span>
        </label>
      ) : null}
      {special ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <select name="club_id" required defaultValue={event?.club_id ?? ""} className="h-11 rounded-xl border border-border px-3">
            <option value="">Shown under which club?</option>
            {visibleClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
          <select name="event_tier" defaultValue={event?.event_tier ?? "minor"} className="h-11 rounded-xl border border-border px-3">
            <option value="minor">Minor event (timeline)</option>
            <option value="major">Major event (Major Events section)</option>
          </select>
        </div>
      ) : slot ? null : canChooseClub ? (
        <select name="club_id" required defaultValue={event?.club_id ?? ""} className="h-11 rounded-xl border border-border px-3">
          <option value="">Select club</option>
          {visibleClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
        </select>
      ) : (
        <input type="hidden" name="club_id" value={event?.club_id ?? assignedClub?.id ?? ""} />
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {slot ? (
          <div className="grid h-11 content-center rounded-xl border border-border bg-slate-50 px-3 text-foreground" title="The event name comes from the club's event list">
            <input type="hidden" name="title" value={slot.event_name} />
            {slot.event_name}
          </div>
        ) : (
          <input name="title" required minLength={3} maxLength={120} defaultValue={event?.title ?? ""} placeholder="Event title" className="h-11 rounded-xl border border-border px-3" />
        )}
        <input name="venue" required minLength={2} maxLength={160} defaultValue={event?.venue ?? ""} placeholder="Venue" className="h-11 rounded-xl border border-border px-3" />
      </div>
      <textarea name="description" required minLength={3} maxLength={1200} defaultValue={event?.description ?? ""} placeholder="About the event" className="min-h-28 rounded-xl border border-border px-3 py-2" />
      <EventScheduleFields start={event?.start_datetime} end={event?.end_datetime} />
      <div className="grid gap-3 lg:grid-cols-2">
        <input name="registration_url" type="url" defaultValue={event?.registration_url ?? ""} placeholder="https:// registration link" className="h-11 rounded-xl border border-border px-3" />
        <select name="status" defaultValue={event?.status ?? "draft"} className="h-11 rounded-xl border border-border px-3">
          <option value="draft">Draft (not on website)</option>
          <option value="published">Published (shows on website)</option>
        </select>
      </div>
      <label className="rounded-xl border border-dashed border-border bg-white px-4 py-4 text-sm text-muted">
        <span className="mb-2 block font-medium text-foreground">Upload event poster</span>
        <input
          name="poster_file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return onPosterProblem(null);
            if (!POSTER_TYPES.includes(file.type)) return onPosterProblem("Poster must be PNG, JPG, or WebP.");
            onPosterProblem(null);
          }}
        />
        <span className="mt-2 block text-xs">PNG, JPG or WebP. Any size.</span>
      </label>
      {event?.poster_url ? (
        <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-border p-3">
          <img src={event.poster_url} alt={`${event.title} poster preview`} className="h-24 w-20 shrink-0 rounded-lg object-cover" />
          <div className="w-0 flex-1 text-sm text-muted">
            <div className="font-medium text-foreground">Current poster</div>
            <a href={event.poster_url} target="_blank" rel="noreferrer" className="block truncate text-primary underline underline-offset-2" title={event.poster_url}>
              {decodeURIComponent(event.poster_url.split("/").pop() ?? "Open poster")}
            </a>
          </div>
        </div>
      ) : null}
      <input name="poster_url" type="url" defaultValue={event?.poster_url ?? ""} placeholder="Optional poster URL fallback" className="h-11 rounded-xl border border-border px-3" />
    </div>
  );
}

function ResultBanner({ result, onClose, viewHref }: { result: EventActionResult; onClose: () => void; viewHref?: string }) {
  return (
    <div
      role={result.ok ? "status" : "alert"}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${result.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}
    >
      {result.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
      <div className="flex-1">
        <div className="font-semibold">{result.ok ? "Done" : "Not saved"}</div>
        <div>{result.message}</div>
        {result.ok && viewHref ? (
          <a href={viewHref} className="mt-1 inline-block font-semibold underline underline-offset-2">View it in the list ↓</a>
        ) : null}
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="rounded p-1 hover:bg-black/5">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function EventForm({
  event,
  visibleClubs,
  canChooseClub,
  assignedClub,
  slot,
  special,
  linkOptions
}: {
  event?: Event;
  visibleClubs: Club[];
  canChooseClub: boolean;
  assignedClub: Club | null;
  /** the club event this schedule belongs to (fixes club, name and major/minor) */
  slot?: EventSlotInfo;
  /** Super Admin special event (not one of a club's listed events) */
  special?: boolean;
  /** old events that aren't linked to a club event yet */
  linkOptions?: EventSlotInfo[];
}) {
  const router = useRouter();
  const isEdit = Boolean(event?.id);
  const [result, setResult] = useState<EventActionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [posterProblem, setPosterProblem] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    if (posterProblem) {
      setResult({ ok: false, message: posterProblem });
      return;
    }
    // read the fields before they are disabled below (disabled fields are not sent)
    const formData = new FormData(e.currentTarget);
    setSaving(true);
    setResult(null);
    let next: EventActionResult;
    try {
      // upload the poster straight to storage, then send only its link
      const poster = formData.get("poster_file");
      if (poster instanceof File && poster.size > 0) {
        formData.set("poster_url", await uploadFromBrowser("event-posters", String(formData.get("club_id") || ""), poster));
      }
      formData.delete("poster_file");
      next = await saveEvent(formData);
    } catch (error) {
      next = { ok: false, message: error instanceof Error && error.message ? error.message : "Could not reach the server. Check your connection and try again." };
    }
    setSaving(false);
    setResult(next);
    if (next.ok) {
      if (!isEdit) {
        setFormKey((k) => k + 1); // clear the form for the next event
        setPosterProblem(null);
      }
      router.refresh();
    }
    requestAnimationFrame(() => bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" aria-busy={saving}>
      <fieldset disabled={saving} className="contents">
        <EventFields key={formKey} event={event} visibleClubs={visibleClubs} canChooseClub={canChooseClub} assignedClub={assignedClub} slot={slot} special={special} linkOptions={linkOptions} onPosterProblem={setPosterProblem} />
      </fieldset>
      {posterProblem ? <p className="text-sm font-medium text-red-600">{posterProblem}</p> : null}
      <div ref={bannerRef} className="grid gap-3">
        {result ? (
          <ResultBanner result={result} onClose={() => setResult(null)} viewHref={result.ok && !isEdit && result.id ? `#event-${result.id}` : undefined} />
        ) : null}
        <button
          disabled={saving}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white disabled:cursor-wait disabled:opacity-70"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {isEdit ? "Saving changes…" : "Creating event…"}</>
          ) : isEdit ? (
            "Save changes"
          ) : (
            <><Plus className="h-4 w-4" /> {slot ? "Add schedule" : "Create event"}</>
          )}
        </button>
      </div>
    </form>
  );
}

export function DeleteEventButton({ id, clubId, title }: { id: string; clubId: string; title: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<EventActionResult | null>(null);

  async function handleDelete() {
    if (deleting || !window.confirm(`Delete “${title}”? This can't be undone.`)) return;
    setDeleting(true);
    setResult(null);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("club_id", clubId);
    let next: EventActionResult;
    try {
      next = await deleteEvent(formData);
    } catch {
      next = { ok: false, message: "Could not reach the server. Check your connection and try again." };
    }
    setDeleting(false);
    setResult(next);
    if (next.ok) router.refresh();
  }

  return (
    <div className="grid gap-3">
      {result && !result.ok ? <ResultBanner result={result} onClose={() => setResult(null)} /> : null}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} {deleting ? "Deleting…" : "Delete event"}
      </button>
    </div>
  );
}
