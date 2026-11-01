"use client";

// "Install app" in the header: shown only when the browser offers to
// install Listy (Chrome / Edge / Android fire `beforeinstallprompt`; other
// browsers use their own Share / menu option, so nothing shows there).

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

/** Not in TypeScript's DOM types yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Keep it for our button instead of the browser's own mini bar.
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    // The event can only be used once, whatever the answer.
    await prompt.userChoice.catch(() => null);
    setPrompt(null);
  }

  return (
    <button onClick={install} className="btn-ghost animate-pop" title="Install Listy as an app">
      <Download className="icon-nudge" aria-hidden />
      <span className="sr-only">Install app</span>
    </button>
  );
}
