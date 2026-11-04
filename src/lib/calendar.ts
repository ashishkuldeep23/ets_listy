// "Add to calendar" for a reminder: a Google Calendar link and an .ics file
// (Apple, Outlook and others). Pure functions, no server involved.

const EVENT_LENGTH_MS = 30 * 60_000;
/** A folded .ics line may be at most 75 bytes, and a character at most 4. */
const ICS_CHARS_PER_LINE = 18;

export interface CalendarEvent {
  /** Part of the file's unique id: the same reminder replaces itself when added again. */
  id: string;
  title: string;
  start: Date;
  url: string;
}

/** 20261104T103000Z */
const utcStamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const endOf = (start: Date) => new Date(start.getTime() + EVENT_LENGTH_MS);

export function googleCalendarUrl({ title, start, url }: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${utcStamp(start)}/${utcStamp(endOf(start))}`,
    details: url,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const escapeIcs = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Splits by whole characters (Array.from), so Hindi text and emoji are never cut in half. */
function foldIcsLine(line: string): string {
  const chars = Array.from(line);
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += ICS_CHARS_PER_LINE) parts.push(chars.slice(i, i + ICS_CHARS_PER_LINE).join(""));
  return parts.join("\r\n ");
}

export function icsContent({ id, title, start, url }: CalendarEvent, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Listy//Reminders//EN",
    "BEGIN:VEVENT",
    `UID:listy-${id}@listy`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(endOf(start))}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(url)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(title)}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** A date in the form <input type="datetime-local"> uses, in the device's time zone. */
export function toDateTimeLocal(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
