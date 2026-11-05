// Feedback rules used by both the validator and the page, and each card's colour.

export const FEEDBACK_DEFAULT_NAME = "User";
export const FEEDBACK_DEFAULT_RATING = 5;

export const FEEDBACK_CATEGORIES = ["suggestion", "appreciation", "feedback", "bug"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
/** Also what older entries, saved before categories existed, count as. */
export const FEEDBACK_DEFAULT_CATEGORY: FeedbackCategory = "feedback";

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  suggestion: "Suggestion",
  appreciation: "Appreciation",
  feedback: "Feedback",
  bug: "Bug",
};

export const isFeedbackCategory = (value: unknown): value is FeedbackCategory =>
  (FEEDBACK_CATEGORIES as readonly unknown[]).includes(value);

// Written out in full: Tailwind only generates classes it can find as plain text.
const TONES = [
  "border-tone-1/50 bg-tone-1/10 hover:border-tone-1",
  "border-tone-2/50 bg-tone-2/10 hover:border-tone-2",
  "border-tone-3/50 bg-tone-3/10 hover:border-tone-3",
  "border-tone-4/50 bg-tone-4/10 hover:border-tone-4",
  "border-tone-5/50 bg-tone-5/10 hover:border-tone-5",
  "border-tone-6/50 bg-tone-6/10 hover:border-tone-6",
] as const;

/**
 * A card's colours. Looks random across cards, but comes from the id, so a
 * card keeps its colour on every visit instead of changing on each reload.
 */
export function feedbackTone(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length] ?? TONES[0];
}
