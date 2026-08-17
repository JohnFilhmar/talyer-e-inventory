'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Per-key override for turning a raw query-string value into the filter type.
 * Only needed where the default's runtime type is not enough to infer it
 * (string unions, comma-joined id lists that need validating, and so on).
 */
type Parsers<T> = { [K in keyof T]?: (raw: string) => T[K] };

/**
 * Recovers a typed value from its query-string form.
 *
 * A malformed value must never reach the API — `?page=abc` has to read as the
 * default page, not as NaN, because a hostile or hand-edited URL is otherwise
 * a crash on page load.
 */
function coerce<V>(raw: string, fallback: V, parser?: (raw: string) => V): V {
  if (parser) {
    try {
      const parsed = parser(raw);
      return parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }
  if (typeof fallback === 'number') {
    const asNumber = Number(raw);
    return (Number.isFinite(asNumber) ? asNumber : fallback) as V;
  }
  if (typeof fallback === 'boolean') {
    if (raw === 'true') return true as V;
    if (raw === 'false') return false as V;
    return fallback;
  }
  return raw as V;
}

/**
 * Keeps a list page's filter state in the query string instead of `useState`.
 *
 * The URL is the single source of truth — nothing is mirrored into local state
 * — so the browser Back button, a refresh, and a link pasted to a colleague all
 * restore the same view without any reconciliation code.
 *
 * `defaults` MUST be a module-level constant. `filters` is memoised on the
 * query string and on `defaults`' identity; a fresh object literal per render
 * would produce a fresh `filters` per render, and any child deriving local
 * state from it (see ProductFilters) would reset on every keystroke.
 */
export function useUrlFilters<T extends Record<string, unknown>>(
  defaults: T,
  parse?: Parsers<T>
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Depend on the serialised string, not the object: Next hands back a new
  // ReadonlyURLSearchParams instance on every render.
  const search = searchParams.toString();

  const filters = useMemo(() => {
    const params = new URLSearchParams(search);
    const next = { ...defaults };

    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const raw = params.get(key);
      if (raw === null) continue;
      next[key] = coerce(raw, defaults[key], parse?.[key]) as T[keyof T & string];
    }

    return next;
  }, [search, defaults, parse]);

  const setFilters = useCallback(
    (next: Partial<T>, mode: 'push' | 'replace' = 'replace') => {
      const merged: T = { ...filters, ...next };

      // Changing a filter while on page 5 would otherwise land on an empty
      // page. Only an explicit page change keeps the page.
      const changesSomethingElse = Object.keys(next).some((key) => key !== 'page');
      if (changesSomethingElse && next.page === undefined && 'page' in defaults) {
        (merged as Record<string, unknown>).page = defaults.page;
      }

      const params = new URLSearchParams();
      for (const key of Object.keys(defaults) as (keyof T & string)[]) {
        const value = merged[key];
        const isEmpty = value === undefined || value === null || value === '';
        // A value equal to its default is implied, so it stays out of the URL
        // and an untouched list is a bare path.
        if (isEmpty || Object.is(value, defaults[key])) continue;
        params.set(key, String(value));
      }

      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      // `scroll: false` throughout — without it every filter keystroke yanks
      // the viewport back to the top of the page.
      if (mode === 'push') {
        router.push(url, { scroll: false });
      } else {
        router.replace(url, { scroll: false });
      }
    },
    [filters, defaults, pathname, router]
  );

  const resetFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return { filters, setFilters, resetFilters };
}
