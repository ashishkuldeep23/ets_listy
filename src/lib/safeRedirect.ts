// Checks a `?next=` value before redirecting to it after login, so a link
// like /login?next=https://evil.com can't send users to another site
// (an "open redirect").

/** Returns `value` if it is a safe same-site path, otherwise `fallback`. */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length > 512) return fallback;
  // Must be a single-slash path. "//evil.com" and "/\evil.com" are treated
  // by browsers as links to another host.
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  // No control characters (tabs/newlines are stripped by browsers and can
  // turn "/\t/evil.com" into "//evil.com").
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
