import { LoaderCircle } from "lucide-react";

// Spinner + text for loading states.
export default function Loading({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-muted ${className}`}>
      <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden />
      {label}
    </p>
  );
}
