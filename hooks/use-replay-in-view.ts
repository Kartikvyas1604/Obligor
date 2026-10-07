"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True while the element is in the viewport, false when it fully leaves —
 * so entry-triggered animations (count-ups, reveals) replay on every pass,
 * not just the first time.
 */
export function useReplayInView(
  ref: RefObject<Element | null>,
  minVisibility = 0.35,
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: minVisibility },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, minVisibility]);

  return inView;
}
