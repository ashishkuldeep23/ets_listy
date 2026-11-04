// Bottom of every page: brand, links and copyright. Extra bottom padding below
// the lg width keeps it clear of a list's chat button, which sits bottom-right.

import Link from "next/link";
import CopyrightYear from "@/components/CopyrightYear";

const LINKS = [
  { href: "/", label: "My lists" },
  { href: "/?tab=shared", label: "Shared with me" },
  { href: "/profile", label: "Profile" },
  { href: "/feedback", label: "Feedback" },
];

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-border text-sm text-muted">
      <div className="mx-auto w-full max-w-3xl px-6 pt-6 pb-20 lg:pb-6">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
          <div>
            <p className="text-base font-semibold text-primary">Listy</p>
            <p className="mt-1">Make and manage simple lists.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={`transition-colors hover:text-accent ${link.href === "/feedback" ? " font-bold text-accent " : ""}`}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-5 border-t border-border pt-4 text-center text-xs sm:text-left">
          &copy; <CopyrightYear /> Listy. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
