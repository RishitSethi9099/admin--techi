"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HOUR_OPTIONS, MINUTE_OPTIONS, formatTime, istToIso, toIstParts, type TimeParts } from "@/lib/event-time";

const fieldClass = "h-11 rounded-xl border border-border bg-white px-3";

function addHours(parts: TimeParts, hours: number): TimeParts {
  let h24 = (Number(parts.hour) % 12) + (parts.meridiem === "PM" ? 12 : 0);
  h24 = (h24 + hours) % 24;
  const meridiem = h24 >= 12 ? "PM" : "AM";
  const hour = String(h24 % 12 === 0 ? 12 : h24 % 12);
  return { hour, minute: parts.minute, meridiem };
}

function TimePicker({
  label,
  prefix,
  value,
  onChange,
  invalidMessage
}: {
  label: string;
  prefix: "start" | "end";
  value: TimeParts;
  onChange: (value: TimeParts) => void;
  invalidMessage?: string;
}) {
  const hourRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    hourRef.current?.setCustomValidity(invalidMessage ?? "");
  }, [invalidMessage]);
  const minutes = MINUTE_OPTIONS.includes(value.minute) ? MINUTE_OPTIONS : [...MINUTE_OPTIONS, value.minute].sort();

  return (
    <fieldset className="grid gap-1 text-sm">
      <legend className="mb-1 font-medium text-foreground">{label}</legend>
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
        <select
          ref={hourRef}
          name={`${prefix}_hour`}
          aria-label={`${label} hour`}
          value={value.hour}
          onChange={(e) => onChange({ ...value, hour: e.target.value })}
          className={fieldClass}
        >
          {HOUR_OPTIONS.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
        </select>
        <span className="font-semibold text-muted">:</span>
        <select
          name={`${prefix}_minute`}
          aria-label={`${label} minutes`}
          value={value.minute}
          onChange={(e) => onChange({ ...value, minute: e.target.value })}
          className={fieldClass}
        >
          {minutes.map((minute) => <option key={minute} value={minute}>{minute}</option>)}
        </select>
        <div className="flex h-11 overflow-hidden rounded-xl border border-border" role="radiogroup" aria-label={`${label} AM or PM`}>
          {(["AM", "PM"] as const).map((meridiem) => (
            <label
              key={meridiem}
              className={`grid w-12 cursor-pointer place-items-center text-sm font-semibold ${value.meridiem === meridiem ? "bg-primary text-white" : "bg-white text-muted"}`}
            >
              <input
                type="radio"
                name={`${prefix}_meridiem`}
                value={meridiem}
                checked={value.meridiem === meridiem}
                onChange={() => onChange({ ...value, meridiem })}
                className="sr-only"
              />
              {meridiem}
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

export function EventScheduleFields({ start, end }: { start?: string | null; end?: string | null }) {
  const initial = useMemo(() => {
    const s = toIstParts(start);
    const e = toIstParts(end);
    const startTime: TimeParts = s ?? { hour: "10", minute: "00", meridiem: "AM" };
    return {
      date: s?.date ?? "",
      endDate: e?.date ?? s?.date ?? "",
      startTime,
      endTime: e ?? addHours(startTime, 1),
      overnight: Boolean(s && e && s.date !== e.date)
    };
  }, [start, end]);

  const [date, setDate] = useState(initial.date);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [overnight, setOvernight] = useState(initial.overnight);

  const effectiveEndDate = overnight ? endDate : date;
  const startIso = date ? istToIso(date, startTime.hour, startTime.minute, startTime.meridiem) : "";
  const endIso = effectiveEndDate ? istToIso(effectiveEndDate, endTime.hour, endTime.minute, endTime.meridiem) : "";

  let problem: string | undefined;
  if (startIso && endIso && Date.parse(endIso) <= Date.parse(startIso)) {
    problem = overnight
      ? "The end must be after the start."
      : "The end time is before the start time. If the event runs past midnight, tick “Runs overnight”.";
  }

  let summary: string | null = null;
  if (startIso && endIso && !problem) {
    const minutes = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const duration = [hours ? `${hours} hr` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
    summary = `${formatTime(startTime)} – ${formatTime(endTime)}${overnight ? " (next day or later)" : ""} · ${duration}`;
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">{overnight ? "Start date" : "Event date"}</span>
          <input
            name="event_date"
            type="date"
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
            }}
            className={fieldClass}
          />
        </label>
        {overnight ? (
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">End date</span>
            <input
              name="end_date"
              type="date"
              required
              min={date || undefined}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={fieldClass}
            />
          </label>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <TimePicker
          label="Start time"
          prefix="start"
          value={startTime}
          onChange={(next) => {
            setStartTime(next);
            const nextStart = date ? istToIso(date, next.hour, next.minute, next.meridiem) : "";
            if (!overnight && nextStart && endIso && Date.parse(endIso) <= Date.parse(nextStart)) setEndTime(addHours(next, 1));
          }}
        />
        <TimePicker label="End time" prefix="end" value={endTime} onChange={setEndTime} invalidMessage={problem} />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="overnight"
          checked={overnight}
          onChange={(e) => {
            setOvernight(e.target.checked);
            if (e.target.checked && (!endDate || endDate <= date) && date) {
              const next = new Date(`${date}T00:00:00Z`);
              next.setUTCDate(next.getUTCDate() + 1);
              setEndDate(next.toISOString().slice(0, 10));
            }
          }}
          className="h-4 w-4 accent-primary"
        />
        Runs overnight / ends on a different day
      </label>

      {problem ? <p className="text-sm font-medium text-red-600">{problem}</p> : null}
      {summary ? <p className="text-sm text-muted">{summary} · India time (IST)</p> : null}
    </div>
  );
}
