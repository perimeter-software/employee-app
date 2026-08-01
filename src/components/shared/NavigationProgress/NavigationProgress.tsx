'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// A thin bar across the top of the viewport while a route change is pending.
//
// App Router client pages have to download their JS chunk and run their first
// data fetch before anything renders, which reads as a frozen screen. The bar
// keeps the current page fully visible and just says "this is happening".
//
// Next 14's App Router has no router.events to hook, so navigation start is
// detected by intercepting link clicks (capture phase, before Next handles
// them) and navigation end by watching pathname/searchParams settle.

// Don't show the bar at all for navigations that resolve quickly — a bar that
// flashes for 60ms is noise.
const START_DELAY_MS = 120;
// How often the bar creeps forward while waiting.
const TRICKLE_MS = 200;
// How long the filled bar stays on screen after completing.
const DONE_HOLD_MS = 220;
// Failsafe: a click that never actually navigates (opens a modal, is
// cancelled) must not leave the bar stuck on screen forever.
const MAX_MS = 15000;

const START_EVENT = 'navigation-progress:start';

/**
 * Shows the bar for a navigation that isn't triggered by a link click —
 * `router.push` from a button, a redirect after a form submit, etc.
 */
export function startNavigationProgress(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(START_EVENT));
}

function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}

/** True when clicking this anchor hands off to the Next router (not the browser). */
function isInAppNavigation(anchor: HTMLAnchorElement): boolean {
  // `download` and `target=_blank` leave the current document alone.
  if (anchor.hasAttribute('download')) return false;
  if (anchor.target && anchor.target !== '_self') return false;

  const href = anchor.getAttribute('href');
  if (!href) return false;
  // mailto:, tel:, and bare #anchors never swap the page.
  if (href.startsWith('#')) return false;

  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return false;
  }

  if (url.origin !== window.location.origin) return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  // Navigating to where we already are renders nothing new.
  const current = window.location.pathname + window.location.search;
  return url.pathname + url.search !== current;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  // Mirrors `visible` for the callbacks, which need to read it without taking
  // it as a dependency (that would re-register the click listener constantly).
  const showing = useRef(false);

  const clearTimers = useCallback(() => {
    if (startTimer.current) clearTimeout(startTimer.current);
    if (trickleTimer.current) clearInterval(trickleTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (failsafeTimer.current) clearTimeout(failsafeTimer.current);
    startTimer.current = null;
    trickleTimer.current = null;
    hideTimer.current = null;
    failsafeTimer.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!pending.current) return;
    pending.current = false;
    clearTimers();

    // Never showed (navigation beat START_DELAY_MS) — nothing to wind down.
    if (!showing.current) return;

    setProgress(100);
    hideTimer.current = setTimeout(() => {
      showing.current = false;
      setVisible(false);
      setProgress(0);
    }, DONE_HOLD_MS);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    clearTimers();

    startTimer.current = setTimeout(() => {
      showing.current = true;
      setVisible(true);
      setProgress(8);
      // Ease toward 90% and wait there — the last 10% belongs to the
      // navigation actually completing.
      trickleTimer.current = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + (90 - p) * 0.12));
      }, TRICKLE_MS);
    }, START_DELAY_MS);

    failsafeTimer.current = setTimeout(finish, MAX_MS);
  }, [clearTimers, finish]);

  // Navigation finished: the route (or its query string) has settled.
  // Also runs on mount, where it is a no-op.
  useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isPlainLeftClick(event)) return;

      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor || !isInAppNavigation(anchor as HTMLAnchorElement)) return;

      start();
    };

    // Capture phase: Next's Link handler runs on bubble, so this sees the
    // click first and isn't skipped when Link calls preventDefault.
    document.addEventListener('click', onClick, true);
    window.addEventListener(START_EVENT, start);
    // Back/forward is a navigation too.
    window.addEventListener('popstate', start);

    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener('popstate', start);
    };
  }, [start]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px]"
    >
      <div
        className="h-full bg-appPrimary shadow-[0_0_10px_rgba(0,0,0,0.2)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
