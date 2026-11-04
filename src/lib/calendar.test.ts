import { describe, expect, it } from "vitest";
import { googleCalendarUrl, icsContent, toDateTimeLocal } from "@/lib/calendar";

const event = {
  id: "f1-1",
  title: "Market, Oct; week",
  start: new Date("2026-11-04T10:30:00.000Z"),
  url: "https://listy.example/folders/f1",
};

describe("googleCalendarUrl", () => {
  it("has the title, a 30 minute slot and the link", () => {
    const params = new URL(googleCalendarUrl(event)).searchParams;
    expect(params.get("action")).toBe("TEMPLATE");
    expect(params.get("text")).toBe(event.title);
    expect(params.get("dates")).toBe("20261104T103000Z/20261104T110000Z");
    expect(params.get("details")).toBe(event.url);
  });
});

describe("icsContent", () => {
  const unfold = (ics: string) => ics.replace(/\r\n /g, "");

  it("has the event, its alarm, and uses CRLF line ends", () => {
    const ics = icsContent(event, new Date("2026-11-01T00:00:00.000Z"));
    const text = unfold(ics);
    expect(text).toContain("DTSTART:20261104T103000Z\r\n");
    expect(text).toContain("DTEND:20261104T110000Z\r\n");
    expect(text).toContain("BEGIN:VALARM\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("escapes characters special to the format, so a list name can't add fields", () => {
    const text = unfold(icsContent({ ...event, title: "A,B;C\\D\nATTENDEE:x" }));
    expect(text).toContain("SUMMARY:A\\,B\\;C\\\\D\\nATTENDEE:x\r\n");
    expect(text).not.toMatch(/^ATTENDEE/m);
  });

  it("keeps every line within 75 bytes without cutting characters", () => {
    const title = "बाज़ार की सूची 🛒".repeat(10);
    const ics = icsContent({ ...event, title });
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`SUMMARY:${title}\r\n`);
  });
});

describe("toDateTimeLocal", () => {
  it("round-trips through the device's time zone", () => {
    const date = new Date(2026, 10, 4, 16, 5);
    expect(toDateTimeLocal(date)).toBe("2026-11-04T16:05");
    expect(new Date(toDateTimeLocal(date)).getTime()).toBe(date.getTime());
  });
});
