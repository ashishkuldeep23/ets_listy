import { getStatus, type FolderStatus } from "@/lib/constants";

// Small outlined label showing a folder's status, coloured from the theme.
export default function StatusBadge({ status }: { status: FolderStatus }) {
  const s = getStatus(status);
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${s.badge}`}>{s.label}</span>;
}
