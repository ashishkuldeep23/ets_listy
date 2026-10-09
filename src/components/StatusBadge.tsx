import { CircleCheckBig, Clock, Zap, type LucideIcon } from "lucide-react";
import { getStatus, type FolderStatus } from "@/lib/constants";

// Small outlined label showing a folder's status, coloured from the theme.
// Icons live here, not in lib/constants, so server code doesn't load the icon set.
// Typed by FolderStatus: adding a status without an icon is a type error.
const STATUS_ICONS: Record<FolderStatus, LucideIcon> = {
  active: Zap,
  pending: Clock,
  completed: CircleCheckBig,
};

export default function StatusBadge({ status }: { status: FolderStatus }) {
  const s = getStatus(status);
  const Icon = STATUS_ICONS[s.value];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${s.badge}`}>
      <Icon className="size-3" aria-hidden />
      {s.label}
    </span>
  );
}
