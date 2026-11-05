"use client";

// Feedback page body: on the left (top on phones) a form to leave feedback, on
// the right everyone's feedback as coloured cards, loaded on arrival. I can
// edit and delete my own: edit loads it into the form, delete asks first and
// shows at once (put back if the server refuses).

import { useEffect, useState, type FormEvent } from "react";
import {
  Bug,
  CircleCheck,
  Heart,
  Lightbulb,
  LoaderCircle,
  MessageSquare,
  MessageSquareHeart,
  MessagesSquare,
  Pencil,
  Send,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import ErrorText from "@/components/ErrorText";
import Loading from "@/components/Loading";
import { apiFetch } from "@/lib/apiClient";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_DEFAULT_CATEGORY,
  FEEDBACK_DEFAULT_NAME,
  FEEDBACK_DEFAULT_RATING,
  feedbackTone,
  type FeedbackCategory,
} from "@/lib/feedback";
import { LIMITS } from "@/lib/limits";
import type { FeedbackDTO, FeedbackListResponse } from "@/types";

const STARS = Array.from({ length: LIMITS.FEEDBACK_RATING_MAX }, (_, i) => i + 1);

const CATEGORY_ICONS: Record<FeedbackCategory, LucideIcon> = {
  suggestion: Lightbulb,
  appreciation: Heart,
  feedback: MessageSquare,
  bug: Bug,
};

const starLabel = (n: number) => `${n} ${n === 1 ? "star" : "stars"}`;
const asTime = (value: string | Date) => new Date(value).getTime();

export default function FeedbackView() {
  const [items, setItems] = useState<FeedbackDTO[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [editing, setEditing] = useState<FeedbackDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<FeedbackListResponse>("/api/feedback")
      .then((res) => !cancelled && setItems(res.feedback))
      .catch((err: unknown) => !cancelled && setLoadError(err instanceof Error ? err.message : "Could not load feedback"));
    return () => {
      cancelled = true;
    };
  }, []);

  function onSaved(saved: FeedbackDTO) {
    setItems((prev) => (prev?.some((f) => f.id === saved.id) ? prev.map((f) => (f.id === saved.id ? saved : f)) : [saved, ...(prev ?? [])]));
    setEditing(null);
  }

  function startEdit(feedback: FeedbackDTO) {
    setEditing(feedback);
    // On a phone the form is above the cards, possibly off screen.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(feedback: FeedbackDTO) {
    if (!confirm("Delete your feedback?")) return;
    const before = items;
    setActionError("");
    setItems((prev) => prev?.filter((f) => f.id !== feedback.id) ?? prev);
    if (editing?.id === feedback.id) setEditing(null);
    try {
      await apiFetch(`/api/feedback/${feedback.id}`, { method: "DELETE" });
    } catch (err) {
      setItems(before);
      setActionError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <section className="card animate-fade-up lg:sticky lg:top-6">
        {/* A new key gives a fresh form when editing starts or ends. */}
        <FeedbackForm key={editing?.id ?? "new"} editing={editing} onSaved={onSaved} onCancel={() => setEditing(null)} />
      </section>

      <section className="min-w-0">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
          <MessagesSquare className="size-5 text-accent" aria-hidden />
          What people say
          {items && items.length > 0 && <span className="text-sm font-normal text-muted">{items.length}</span>}
        </h2>
        <ErrorText message={loadError || actionError} className="mb-3" />
        {items === null && !loadError && <Loading />}
        {items?.length === 0 && (
          <div className="card flex animate-fade-up flex-col items-center gap-3 py-10 text-center text-muted">
            <MessageSquareHeart className="size-10 animate-float text-primary/70" aria-hidden />
            <p>No feedback yet. Be the first to share yours.</p>
          </div>
        )}
        <ul className="stagger grid gap-4 sm:grid-cols-2">
          {items?.map((feedback) => (
            <FeedbackCard
              key={feedback.id}
              feedback={feedback}
              editing={editing?.id === feedback.id}
              onEdit={() => startEdit(feedback)}
              onDelete={() => remove(feedback)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

interface FeedbackFormProps {
  editing: FeedbackDTO | null;
  onSaved: (feedback: FeedbackDTO) => void;
  onCancel: () => void;
}

function FeedbackForm({ editing, onSaved, onCancel }: FeedbackFormProps) {
  // The default name shows as the placeholder: left empty, the server uses it.
  const [name, setName] = useState(editing && editing.name !== FEEDBACK_DEFAULT_NAME ? editing.name : "");
  const [category, setCategory] = useState<FeedbackCategory>(editing?.category ?? FEEDBACK_DEFAULT_CATEGORY);
  const [rating, setRating] = useState(editing?.rating ?? FEEDBACK_DEFAULT_RATING);
  const [message, setMessage] = useState(editing?.message ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [thanked, setThanked] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!message.trim()) return setError("Please write a message");
    setBusy(true);
    setError("");
    setThanked(false);
    try {
      const saved = await apiFetch<FeedbackDTO>(editing ? `/api/feedback/${editing.id}` : "/api/feedback", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ name, category, rating, message }),
      });
      onSaved(saved);
      setName("");
      setCategory(FEEDBACK_DEFAULT_CATEGORY);
      setRating(FEEDBACK_DEFAULT_RATING);
      setMessage("");
      setThanked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-primary">
          <MessageSquareHeart className="size-5" aria-hidden />
          {editing ? "Edit your feedback" : "Share your feedback"}
        </h1>
        {editing && (
          <button type="button" onClick={onCancel} className="btn-ghost px-2 py-1" title="Cancel editing">
            <X className="icon-nudge" aria-hidden />
            <span className="sr-only">Cancel editing</span>
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span>
          Name <span className="text-muted">(optional)</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={FEEDBACK_DEFAULT_NAME}
          maxLength={LIMITS.FEEDBACK_NAME_MAX}
          autoComplete="off"
          className="input"
        />
      </label>

      <CategoryPicker value={category} onChange={setCategory} />

      <StarPicker value={rating} onChange={setRating} />

      <label className="flex flex-col gap-1 text-sm">
        Message
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setThanked(false);
          }}
          placeholder="What do you like? What could be better?"
          maxLength={LIMITS.FEEDBACK_MESSAGE_MAX}
          rows={5}
          required
          className="input resize-y"
        />
        <span className="self-end text-xs text-muted">
          {message.length} / {LIMITS.FEEDBACK_MESSAGE_MAX}
        </span>
      </label>

      <ErrorText message={error} />
      {thanked && (
        <p className="flex items-center gap-1.5 text-sm text-accent" role="status">
          <CircleCheck className="size-4 animate-pop" aria-hidden />
          Thanks for your feedback!
        </p>
      )}

      <button disabled={busy || !message.trim()} className="btn-primary group">
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4 transition-transform duration-200 group-enabled:group-hover:translate-x-0.5 group-enabled:group-hover:-translate-y-0.5" aria-hidden />
        )}
        {busy ? "Sending…" : editing ? "Save changes" : "Submit"}
      </button>
    </form>
  );
}

/** Real radio buttons under the pills, so arrow keys and screen readers work. */
function CategoryPicker({ value, onChange }: { value: FeedbackCategory; onChange: (category: FeedbackCategory) => void }) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1">Category</legend>
      <div className="flex flex-wrap gap-2">
        {FEEDBACK_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category];
          return (
            <label key={category} className="cursor-pointer">
              <input
                type="radio"
                name="feedback-category"
                value={category}
                checked={value === category}
                onChange={() => onChange(category)}
                className="peer sr-only"
              />
              <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-muted transition-colors duration-150 peer-checked:border-accent peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent hover:text-fg">
                <Icon className="size-4" aria-hidden />
                {FEEDBACK_CATEGORY_LABELS[category]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Real radio buttons under the stars, so arrow keys and screen readers work. Hovering previews a rating. */
function StarPicker({ value, onChange }: { value: number; onChange: (stars: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1">Rating</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
        {STARS.map((n) => (
          <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)}>
            <input
              type="radio"
              name="feedback-rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              aria-label={starLabel(n)}
              className="peer sr-only"
            />
            <Star
              // A new key replays the pop on the star just chosen.
              key={value === n ? "chosen" : "other"}
              className={`size-7 rounded-sm transition-[color,fill,scale] duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent hover:scale-115 ${
                value === n ? "animate-pop" : ""
              } ${n <= shown ? "fill-primary text-primary" : "text-muted"}`}
              aria-hidden
            />
          </label>
        ))}
        <span className="ml-2 text-xs text-muted">{starLabel(shown)}</span>
      </div>
    </fieldset>
  );
}

interface FeedbackCardProps {
  feedback: FeedbackDTO;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function FeedbackCard({ feedback, editing, onEdit, onDelete }: FeedbackCardProps) {
  const edited = asTime(feedback.updatedAt) > asTime(feedback.createdAt);
  const CategoryIcon = CATEGORY_ICONS[feedback.category];

  return (
    <li
      className={`flex animate-fade-up flex-col gap-3 rounded-lg border p-4 transition-[translate,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg ${feedbackTone(feedback.id)} ${
        editing ? "ring-2 ring-accent" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-0.5" role="img" aria-label={starLabel(feedback.rating)}>
          {STARS.map((n) => (
            <Star key={n} className={`size-4 ${n <= feedback.rating ? "fill-primary text-primary" : "text-muted/40"}`} aria-hidden />
          ))}
        </div>
        {feedback.mine && (
          <div className="flex gap-3 text-sm">
            <button onClick={onEdit} className="link" title="Edit">
              <Pencil className="icon-nudge" aria-hidden />
              <span className="sr-only">Edit</span>
            </button>
            <button onClick={onDelete} className="link-danger group" title="Delete">
              <Trash2 className="size-4 group-hover:animate-wiggle" aria-hidden />
              <span className="sr-only">Delete</span>
            </button>
          </div>
        )}
      </div>
      <span className="flex w-fit items-center gap-1 rounded-full border border-accent/50 px-2 py-0.5 text-xs text-accent">
        <CategoryIcon className="size-3.5" aria-hidden />
        {FEEDBACK_CATEGORY_LABELS[feedback.category]}
      </span>
      <p className="flex-1 text-sm wrap-break-word whitespace-pre-wrap">{feedback.message}</p>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span className="font-medium wrap-anywhere text-fg">{feedback.name}</span>
        {feedback.mine && <span className="rounded-full border border-accent/50 px-1.5 text-accent">You</span>}
        <span>
          {new Date(feedback.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          {edited && " · edited"}
        </span>
      </p>
    </li>
  );
}
