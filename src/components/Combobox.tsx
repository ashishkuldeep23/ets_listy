"use client";

// A text input with a suggestion dropdown (group names, price units, people
// to invite). The caller filters the options; this handles opening, closing
// and the keyboard: ↑ / ↓ to move, Enter to pick, Esc to close. While the
// list is closed, Enter submits the form as usual.

import { useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export interface ComboboxOption {
  key: string;
  /** Text put into the input when picked. */
  value: string;
  /** What the row shows (defaults to `value`). */
  label?: ReactNode;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onSelect">;

interface ComboboxProps extends InputProps {
  value: string;
  onChange: (text: string) => void;
  options: ComboboxOption[];
  /** Called after an option is picked (its value is already passed to onChange). */
  onPick?: (option: ComboboxOption) => void;
  loading?: boolean;
  /** Shown when there are no options and the user has typed something (e.g. "No one found"). */
  emptyText?: string;
  /** Icon or anything drawn inside the input on the left (give the input pl-9 via className). */
  leading?: ReactNode;
  wrapperClassName?: string;
}

export default function Combobox({
  value,
  onChange,
  options,
  onPick,
  loading = false,
  emptyText,
  leading,
  wrapperClassName = "",
  onFocus,
  onBlur,
  onKeyDown,
  ...inputProps
}: ComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const showEmpty = Boolean(emptyText) && !loading && options.length === 0 && value.trim() !== "";
  const showList = open && (options.length > 0 || loading || showEmpty);
  // Keeps the highlight inside the list when the options change under it.
  const activeIndex = active < options.length ? active : -1;

  function pick(option: ComboboxOption) {
    onChange(option.value);
    onPick?.(option);
    setOpen(false);
    setActive(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (options.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => {
        const from = i < options.length ? i : -1;
        return (from + step + options.length) % options.length;
      });
    } else if (e.key === "Enter" && showList && options[activeIndex]) {
      // Pick the highlighted option instead of submitting the form.
      e.preventDefault();
      pick(options[activeIndex]);
    } else if (e.key === "Escape" && showList) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      {leading}
      <input
        {...inputProps}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          setActive(-1);
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-60 animate-fade-up overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg shadow-black/40"
        >
          {options.map((option, i) => (
            <li
              key={option.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              // mousedown, not click: picks before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(option);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === activeIndex ? "bg-surface-2 text-accent" : ""}`}
            >
              {option.label ?? option.value}
            </li>
          ))}
          {loading && options.length === 0 && (
            <li className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Searching…
            </li>
          )}
          {showEmpty && <li className="px-3 py-1.5 text-sm text-muted">{emptyText}</li>}
        </ul>
      )}
    </div>
  );
}
