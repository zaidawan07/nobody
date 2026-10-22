import { useEffect, useState } from "react";
import { Share } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isAppleMobile } from "@/components/pwa/install-detection";

/**
 * The install prompt, which has to be two different things.
 *
 * Chromium fires `beforeinstallprompt` when the app is installable, so there
 * we show our own button and suppress the browser's mini-infobar (this also
 * covers Edge and Opera). iOS Safari has no such event and no install dialog
 * at all — nothing can be triggered programmatically — so there the prompt is
 * the instruction itself: tap Share, then Add to Home Screen.
 *
 * Firefox and desktop Safari fire no event and need no fake substitute, so
 * they get nothing. Nothing is shown once the app is already installed
 * (standalone display mode) or after the user has dismissed it.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "estateos:pwa-install-dismissed";

type Mode = "hidden" | "install" | "ios";

function isStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // Set by iOS Safari when the page is running from a home-screen icon.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false; // storage blocked (private mode) — ask again next session
  }
}

function rememberDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "true");
  } catch {
    // nowhere to remember it; the prompt simply returns next session
  }
}

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    if (isAppleMobile(navigator.userAgent, navigator.maxTouchPoints)) {
      setMode("ios");
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      // Stop the browser's own bar; we render a button instead.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setMode("install");
    };
    const onInstalled = () => setMode("hidden");

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    rememberDismissed();
    setMode("hidden");
  };

  const install = async () => {
    if (!deferred) return;
    // Hide first: the native dialog takes the screen while this resolves.
    setMode("hidden");
    setDeferred(null);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      // Refusing it once is an answer — don't ask again next session.
      if (choice.outcome === "dismissed") rememberDismissed();
    } catch {
      // the event went stale or the dialog was refused; nothing to undo
    }
  };

  if (mode === "hidden") return null;

  return (
    <div
      role="region"
      aria-label="Install EstateOS"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Install EstateOS</p>
          {mode === "ios" ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Share className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Tap Share, then Add to Home Screen
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Keep it on your home screen for one-tap access.
            </p>
          )}
        </div>
        {mode === "install" && deferred ? (
          <>
            <Button size="sm" onClick={() => void install()}>
              Install
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Got it
          </Button>
        )}
      </div>
    </div>
  );
}
