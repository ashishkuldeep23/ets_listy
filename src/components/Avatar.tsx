// Round "logo" for a person: the first letter of their name, in bold.
// Used in the header, the profile page and the list chat.

const SIZES = {
  sm: "size-7 text-sm",
  md: "size-8 text-sm",
  lg: "size-16 text-3xl",
} as const;

/** First letter of the name (handles emoji / other scripts as one character). */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "?";
}

/** First word of the name, for "Hi, Asha". */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export default function Avatar({
  name,
  size = "md",
  variant = "primary",
}: {
  name: string;
  size?: keyof typeof SIZES;
  /** primary = golden (me), accent = cyan (other people). */
  variant?: "primary" | "accent";
}) {
  const colors = variant === "primary" ? "bg-primary text-on-primary" : "bg-accent/15 text-accent border border-accent/40";
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold ${SIZES[size]} ${colors}`}
      aria-hidden
    >
      {initialOf(name)}
    </span>
  );
}
