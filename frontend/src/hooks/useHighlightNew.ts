'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 5000;

/**
 * Points the user at a record that just appeared in a list.
 *
 * The ring is applied and removed by a state change, never by a CSS
 * transition — `frontend/docs/Frontend-Guidelines.md` forbids animations and
 * `globals.css` carries exactly one keyframe, for the spinner.
 *
 * Scrolling happens when the callback ref attaches rather than in an effect,
 * because the row only enters the DOM after the list refetches; an effect
 * keyed on the id would fire while the element still does not exist.
 */
export function useHighlightNew(durationMs = DEFAULT_DURATION_MS) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against re-scrolling on every re-render while the ring is up.
  const scrolledForRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const highlight = useCallback(
    (id: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      scrolledForRef.current = null;
      setHighlightedId(id);
      timerRef.current = setTimeout(() => setHighlightedId(null), durationMs);
    },
    [durationMs]
  );

  const attachRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !highlightedId) return;
      if (scrolledForRef.current === highlightedId) return;
      scrolledForRef.current = highlightedId;

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      node.scrollIntoView({
        block: 'center',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    },
    [highlightedId]
  );

  const getHighlightProps = useCallback(
    (id: string) =>
      id === highlightedId
        ? { ref: attachRef, className: 'ring-2 ring-yellow-400 ring-offset-2' }
        : { className: '' },
    [highlightedId, attachRef]
  );

  return { highlightedId, highlight, getHighlightProps };
}
