// Bottom of every page. Bottom padding keeps the link clear of a list's chat button on phones.

import Link from "next/link";
import { MessageSquareHeart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-6 flex items-center justify-center gap-2 border-t border-border px-4 pt-4 pb-6 text-sm text-muted">
      <span>Listy</span>
      <span aria-hidden>·</span>
      <Link href="/feedback" className="link">
        <MessageSquareHeart className="icon-nudge" aria-hidden />
        Feedback
      </Link>
    </footer>
  );
}
