import { CircleAlert } from "lucide-react";

// Red error message with an alert icon; renders nothing when there is no message.
export default function ErrorText({ message, className = "" }: { message: string | null | undefined; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`flex animate-fade-up items-start gap-1.5 text-sm text-danger ${className}`}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}
