// "3 / 10 done" with a thin golden bar. Used on folder cards and the folder page.
export default function ProgressBar({ done, total, size = "md" }: { done: number; total: number; size?: "sm" | "md" }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex-1 overflow-hidden rounded-full bg-surface-2 ${size === "sm" ? "h-1.5" : "h-2"}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Items done"
      >
        <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <span className={`shrink-0 text-muted ${size === "sm" ? "text-xs" : "text-sm"}`}>
        {done} / {total} done
      </span>
    </div>
  );
}
