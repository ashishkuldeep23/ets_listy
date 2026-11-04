"use client";

// Clock button on a list: opens a popup to set, change or remove my reminder
// and shows its date and time once set. The notification comes from the
// server (Web Push); "Add to calendar" also works where notifications can't,
// e.g. permission refused. Calendar events don't follow later changes here.

import { useEffect, useState, type FormEvent } from "react";
import { AlarmClock, BellOff, CalendarPlus, Check, Download, LoaderCircle, Trash2, X } from "lucide-react";
import ErrorText from "@/components/ErrorText";
import { apiFetch } from "@/lib/apiClient";
import { googleCalendarUrl, icsContent, toDateTimeLocal, type CalendarEvent } from "@/lib/calendar";
import { enablePush } from "@/lib/pushClient";
import type { ReminderDTO, ReminderResponse } from "@/types";

const dateLabel = (value: string | Date) =>
  new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function downloadIcs(event: CalendarEvent) {
  const url = URL.createObjectURL(new Blob([icsContent(event)], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "listy-reminder.ics";
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReminderButton({ folderId, listName }: { folderId: string; listName: string }) {
  const url = `/api/folders/${folderId}/reminder`;
  const [reminder, setReminder] = useState<ReminderDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [earliest, setEarliest] = useState("");
  const [error, setError] = useState("");
  // Why notifications won't arrive on this device; the reminder itself is still saved.
  const [pushProblem, setPushProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ReminderResponse>(url)
      .then((res) => !cancelled && setReminder(res.reminder))
      // Only the label depends on it (offline, say); the popup still reports real failures.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openPopup() {
    const now = new Date();
    setEarliest(toDateTimeLocal(now));
    setValue(reminder && !reminder.sent ? toDateTimeLocal(new Date(reminder.remindAt)) : "");
    setError("");
    setPushProblem("");
    setOpen(true);
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setPushProblem("");
    try {
      // The input's value has no time zone: new Date() reads it as this device's local time.
      const res = await apiFetch<ReminderResponse>(url, {
        method: "PUT",
        body: JSON.stringify({ remindAt: new Date(value).toISOString() }),
      });
      setReminder(res.reminder);
      const push = await enablePush();
      if (!push.ok) setPushProblem(push.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await apiFetch(url, { method: "DELETE" });
      setReminder(null);
      setPushProblem("");
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const upcoming = reminder && !reminder.sent ? reminder : null;
  const event: CalendarEvent | null =
    upcoming && open
      ? {
          id: `${folderId}-${new Date(upcoming.remindAt).getTime()}`,
          title: listName,
          start: new Date(upcoming.remindAt),
          url: `${window.location.origin}/folders/${folderId}`,
        }
      : null;

  return (
    <>
      <button onClick={openPopup} className={`${upcoming ? "btn-secondary text-accent" : "btn-ghost"} text-sm`} title="Reminder">
        <AlarmClock className="icon-nudge" aria-hidden />
        {upcoming ? <span>{dateLabel(upcoming.remindAt)}</span> : <span className="sr-only">Set a reminder</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg/80 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reminder-title"
            className="card w-full max-w-sm animate-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="reminder-title" className="flex items-center gap-2 text-lg font-semibold">
                <AlarmClock className="size-5 text-primary" aria-hidden />
                Reminder
              </h2>
              <button onClick={() => setOpen(false)} className="btn-ghost p-1" title="Close">
                <X className="size-4" aria-hidden />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <p className="mb-3 text-sm wrap-break-word text-muted">{listName}</p>

            <form onSubmit={save} className="flex flex-col gap-3">
              <input
                type="datetime-local"
                value={value}
                min={earliest}
                onChange={(e) => setValue(e.target.value)}
                aria-label="Date and time"
                required
                className="input w-full"
              />
              <ErrorText message={error} />
              <div className="flex gap-2">
                <button disabled={busy} className="btn-primary flex-1">
                  {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="icon-nudge" aria-hidden />}
                  Save
                </button>
                {reminder && (
                  <button type="button" disabled={busy} onClick={remove} className="btn-ghost text-danger" title="Remove reminder">
                    <Trash2 className="icon-nudge" aria-hidden />
                    <span className="sr-only">Remove reminder</span>
                  </button>
                )}
              </div>
            </form>

            {pushProblem && (
              <p className="mt-3 flex items-start gap-2 text-sm text-primary">
                <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>Reminder saved, but no notification will arrive here. {pushProblem}</span>
              </p>
            )}

            {event && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-sm text-muted">Also add it to your calendar:</p>
                <div className="flex flex-wrap gap-2">
                  <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">
                    <CalendarPlus className="icon-nudge" aria-hidden />
                    Google Calendar
                  </a>
                  <button type="button" onClick={() => downloadIcs(event)} className="btn-secondary text-sm">
                    <Download className="icon-nudge" aria-hidden />
                    Other calendars
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
