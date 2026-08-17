# Frontend UX: navigation state, post-create feedback, form ergonomics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make list state survive navigation, make a newly created record visible, stop the category form retaining stale data, speed up consecutive product entry, and fix barcode scanning in Add Stock.

**Architecture:** Four independent UI primitives (`useUrlFilters`, `Toast`, `useHighlightNew`, `CollapsibleSection`) are built first, in parallel. Four page-level consumers then adopt them, also in parallel, touching disjoint file sets. The barcode fix depends on nothing and runs alongside phase 1. No backend change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, react-hook-form + zod, TanStack Query v5.

**Spec:** `docs/superpowers/specs/2026-08-17-frontend-ux-navigation-design.md` — read it before starting any task.

## Global Constraints

Copied verbatim from the spec and `frontend/docs/Frontend-Guidelines.md`. Every task's requirements implicitly include this section.

- **Working directory is `frontend/`.** There is no package.json at the repo root. Every command below runs from `D:\My Folder\talyer-e-inventory\frontend`.
- **No test suite exists in `frontend/`, and adding one is out of scope.** Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus the manual browser checks listed per task. Do not claim a task passes without pasting the actual command output. Do not invent test files.
- **No CSS transitions or animations may be added.** `app/globals.css` defines exactly one keyframe (`spin`) and that is the only permitted exception. A highlight appears and disappears instantly via state, never via a fade. `scrollIntoView` may use `behavior: 'smooth'` only when `prefers-reduced-motion` is unset.
- **Strict palette:** yellow-400 `#FBBF24`, black, white, plus gray-100/200/400/500 for chrome. Primary button = yellow bg / black text; secondary = black bg / white text; danger = black bg / red text. Introduce no new colours. (Existing files already use `green-`/`blue-`/`dark:` classes; leave those alone — do not "fix" them, and do not copy them into new components.)
- **Mobile-first responsive is required.** Every new component must be checked at 375 px wide.
- **Extend `components/ui/` primitives rather than adding new base components.**
- **`npm run build` is `next build --webpack`.** Do not remove the `--webpack` flag; `@serwist/next` has no Turbopack support and the build would silently ship no service worker.
- **Commit after each task.** No Claude/AI co-authorship trailer, no "Generated with" footer, in any commit message.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/hooks/useUrlFilters.ts` | *new* — bidirectional adapter between a typed filter object and the query string | 1 |
| `src/components/ui/Toast.tsx` | *new* — `ToastProvider` + `useToast`, transient confirmations | 2 |
| `src/app/(protected)/layout.tsx` | mount `ToastProvider` | 2 |
| `src/hooks/useHighlightNew.ts` | *new* — track one record id, scroll to it, ring it, clear it on a timer | 3 |
| `src/components/ui/CollapsibleSection.tsx` | *new* — collapsible form section that keeps its fields registered | 4 |
| `src/components/ui/index.ts` | barrel; **only task 4 touches it** | 4 |
| `src/components/stock/AddStockModal.tsx` | barcode lookup fix | 5 |
| `src/app/(protected)/categories/page.tsx` | archived filter to URL, highlight on create | 6 |
| `src/components/categories/CategoryFormModal.tsx` | reset bug, `onSuccess(created)` | 6 |
| `src/components/categories/CategoryTree.tsx` | owns `expandedIds`, accepts `expandPath` | 6 |
| `src/components/categories/CategoryNode.tsx` | expansion becomes controlled; New badge | 6 |
| `src/app/(protected)/products/page.tsx` | list filters to URL, highlight `?new=` | 7 |
| `src/app/(protected)/products/new/page.tsx` | collapsible sections, stay-on-form create | 8 |
| `src/app/(protected)/products/[id]/edit/page.tsx` | collapsible sections (auto-open when populated) | 8 |
| `src/app/(protected)/stock/page.tsx` | list filters to URL | 9 |

**Deliberately unshared:** `products/new/page.tsx` declares a local `ProductForm` with a `mode: 'create' | 'edit'` prop that the edit route never uses; `products/[id]/edit/page.tsx` is an independent ~700-line copy of the same markup. Task 8 edits both. **Do not deduplicate them** — that is real debt, but it is out of scope for this plan and would make the diff unreviewable.

## Parallelism

```
PHASE 1  (all five in parallel — disjoint files, no shared symbols)
  Task 1  useUrlFilters
  Task 2  Toast + provider
  Task 3  useHighlightNew
  Task 4  CollapsibleSection
  Task 5  Barcode fix

  ── gate: npm run build must pass with all five merged ──

PHASE 2  (all four in parallel — disjoint files)
  Task 6  Categories      consumes: useUrlFilters, useHighlightNew, useToast
  Task 7  Products list   consumes: useUrlFilters, useHighlightNew
  Task 8  Product forms   consumes: CollapsibleSection, useToast
  Task 9  Stock list      consumes: useUrlFilters
```

Task 2 deliberately does **not** export from `components/ui/index.ts`; only task 4 edits that barrel, so two parallel workers never contend for it.

---

# PHASE 1

### Task 1: `useUrlFilters`

**Files:**
- Create: `frontend/src/hooks/useUrlFilters.ts`
- Test: none — no frontend test suite (see Global Constraints)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export function useUrlFilters<T extends Record<string, unknown>>(
    defaults: T,
    parse?: { [K in keyof T]?: (raw: string) => T[K] }
  ): {
    filters: T;
    setFilters: (next: Partial<T>, mode?: 'push' | 'replace') => void;
    resetFilters: () => void;
  };
  ```
  Tasks 6, 7 and 9 call this. **`defaults` must be a module-level `const` at each call site**, not an inline object literal — the memo depends on its identity, and a fresh literal every render would rebuild `filters` every render, which resets `ProductFilters`' local input state on every keystroke.

- [ ] **Step 1: Create the hook**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors mentioning `useUrlFilters.ts`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0. If the React Compiler lint objects to anything in the hook, fix the hook — do **not** add an `eslint-disable`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useUrlFilters.ts
git commit -m "feat(frontend): add useUrlFilters for URL-backed list state"
```

---

### Task 2: Toast

**Files:**
- Create: `frontend/src/components/ui/Toast.tsx`
- Modify: `frontend/src/app/(protected)/layout.tsx` (wrap children, around line 61-71)
- Test: none

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export function ToastProvider(props: { children: React.ReactNode }): React.JSX.Element;
  export function useToast(): {
    show: (
      message: string,
      options?: { variant?: 'success' | 'error'; action?: { label: string; href: string } }
    ) => void;
  };
  ```
  Tasks 6 and 8 import these **directly from `@/components/ui/Toast`**. Do not add them to `components/ui/index.ts` — task 4 owns that file and a parallel edit would conflict.

- [ ] **Step 1: Create the component**

```tsx
'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

interface ToastAction {
  label: string;
  href: string;
}

interface ToastOptions {
  variant?: 'success' | 'error';
  action?: ToastAction;
}

interface ToastRecord extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

/**
 * Transient confirmations for actions whose result is off-screen.
 *
 * Deliberately additive: every mutation still surfaces its own failure through
 * the page's `Alert`. A toast is never the only place an error appears, because
 * it is gone in five seconds.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, ...options }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      );
    },
    [dismiss]
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Full width at the bottom on a phone, a stack in the corner from sm up.
          A tablet on the shop counter is the primary device. */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={
              toast.variant === 'error'
                ? 'flex items-start gap-3 rounded-lg border-2 border-black bg-black px-4 py-3 shadow-lg'
                : 'flex items-start gap-3 rounded-lg border-2 border-yellow-400 bg-white px-4 py-3 shadow-lg'
            }
          >
            <p
              className={
                toast.variant === 'error'
                  ? 'flex-1 text-sm font-medium text-red-500'
                  : 'flex-1 text-sm font-medium text-black'
              }
            >
              {toast.message}
            </p>

            {toast.action && (
              <Link
                href={toast.action.href}
                onClick={() => dismiss(toast.id)}
                className={
                  toast.variant === 'error'
                    ? 'shrink-0 text-sm font-semibold text-white underline'
                    : 'shrink-0 text-sm font-semibold text-black underline'
                }
              >
                {toast.action.label}
              </Link>
            )}

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className={
                toast.variant === 'error'
                  ? 'shrink-0 text-gray-400 hover:text-white'
                  : 'shrink-0 text-gray-400 hover:text-black'
              }
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return context;
}
```

- [ ] **Step 2: Mount the provider**

In `frontend/src/app/(protected)/layout.tsx`, add the import next to the existing `BranchProvider` import:

```tsx
import { ToastProvider } from '@/components/ui/Toast';
```

and wrap the existing tree — `ToastProvider` goes *inside* `BranchProvider`, so a toast fired from a branch-scoped page still has its context:

```tsx
  return (
    <BranchProvider>
      <ToastProvider>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <OfflineBanner />
          <main className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </ToastProvider>
    </BranchProvider>
  );
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0 for both.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Toast.tsx "src/app/(protected)/layout.tsx"
git commit -m "feat(frontend): add toast notifications to the protected layout"
```

---

### Task 3: `useHighlightNew`

**Files:**
- Create: `frontend/src/hooks/useHighlightNew.ts`
- Test: none

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export function useHighlightNew(durationMs?: number): {
    highlightedId: string | null;
    highlight: (id: string) => void;
    getHighlightProps: (id: string) => { ref?: (node: HTMLElement | null) => void; className: string };
  };
  ```
  Tasks 6 and 7 call this. Spread `getHighlightProps(id)` onto the row element and render your own "New" badge off `highlightedId === id`.

- [ ] **Step 1: Create the hook**

```ts
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
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0 for both.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useHighlightNew.ts
git commit -m "feat(frontend): add useHighlightNew for post-create feedback"
```

---

### Task 4: `CollapsibleSection`

**Files:**
- Create: `frontend/src/components/ui/CollapsibleSection.tsx`
- Modify: `frontend/src/components/ui/index.ts` (**only this task touches the barrel**)
- Test: none

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    badge?: number | string;
    error?: boolean;
    className?: string;
  }
  export const CollapsibleSection: React.FC<CollapsibleSectionProps>;
  ```
  Task 8 consumes it, imported from `@/components/ui`.

- [ ] **Step 1: Create the component**

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  /** Open on first render. Changing it later does not re-open the section. */
  defaultOpen?: boolean;
  /** Count or short label shown beside the title, e.g. `3` renders "Tags (3)". */
  badge?: number | string;
  /** Force the section open and mark the header. Set when it holds an invalid field. */
  error?: boolean;
  className?: string;
}

/**
 * A form section the user can fold away.
 *
 * Content is hidden with the `hidden` attribute rather than unmounted, so every
 * input inside stays registered with react-hook-form and a collapsed section
 * still submits its values. Unmounting would silently drop them.
 *
 * `error` forces the section open. Without that, a validation failure inside a
 * collapsed section blocks the submit with nothing visible to explain why.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
  badge,
  error = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (error) setIsOpen(true);
  }, [error]);

  const contentId = `collapsible-${title.replace(/\s+/g, '-').toLowerCase()}`;
  const expanded = isOpen || error;

  return (
    <div
      className={`bg-white rounded-lg border ${
        error ? 'border-red-500' : 'border-gray-200'
      } ${className}`}
    >
      {/* type="button" is load-bearing: the default submit type would make
          folding a section submit the form it lives in. */}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 px-6 py-4 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-gray-500" />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" />
        )}

        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

        {badge !== undefined && badge !== '' && badge !== 0 && (
          <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-medium text-black">
            {badge}
          </span>
        )}

        {error && (
          <span className="ml-auto text-sm font-medium text-red-600">
            Needs attention
          </span>
        )}
      </button>

      <div id={contentId} hidden={!expanded} className="px-6 pb-6">
        {children}
      </div>
    </div>
  );
};

export default CollapsibleSection;
```

- [ ] **Step 2: Export from the barrel**

Append to `frontend/src/components/ui/index.ts`:

```ts
export { CollapsibleSection } from './CollapsibleSection';
export type { CollapsibleSectionProps } from './CollapsibleSection';
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0 for both.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/CollapsibleSection.tsx src/components/ui/index.ts
git commit -m "feat(frontend): add CollapsibleSection form primitive"
```

---

### Task 5: Fix barcode lookup in Add Stock

**Files:**
- Modify: `frontend/src/components/stock/AddStockModal.tsx` (imports at 1-16; `onScan` handler at 269-291; hint string at 283)
- Test: none

**Interfaces:**
- Consumes: `productService.search` from `@/lib/services/productService`, `productKeys` from `@/hooks/useProducts`, `useQueryClient` from `@tanstack/react-query`.
- Produces: nothing other tasks depend on.

**Why the current code cannot work:** line 274 reads
`searchResults?.find((product) => product.sku === value)`. `searchResults` comes
from `useProductSearch(productSearch, 10)`, and `hooks/useProducts.ts:101` gates
that query with `enabled: debouncedQuery.length >= 2`. The scanner never writes
`productSearch`, so at scan time `searchResults` is `undefined` and the success
branch is unreachable. Separately, the comparison uses `sku` and ignores
`barcode`. The backend is already correct —
`backend/src/controllers/productController.js:269` has `{ barcode: pattern }` in
the `/products/search` `$or` — so this is a frontend-only fix.

- [ ] **Step 1: Add the imports**

At the top of `AddStockModal.tsx`, alongside the existing imports:

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { productService } from '@/lib/services/productService';
import { productKeys } from '@/hooks/useProducts';
```

- [ ] **Step 2: Add lookup state**

Next to the existing `scannerOpen` / `scanFeedback` state (around line 57):

```tsx
const queryClient = useQueryClient();
const [scanLookupPending, setScanLookupPending] = React.useState(false);
// A BarcodeScanner can emit the same code several times as the frame settles.
// Without this, one physical scan fires several lookups and the feedback line
// flickers between them.
const lastScanRef = React.useRef<string | null>(null);
```

- [ ] **Step 3: Replace the `onScan` handler**

Replace the whole `onScan={(value) => { ... }}` prop (lines 272-281) with:

```tsx
onScan={async (value) => {
  if (scanLookupPending) return;
  if (lastScanRef.current === value) return;
  lastScanRef.current = value;
  setScanLookupPending(true);
  setScanFeedback('Looking up barcode...');

  try {
    // Imperative on purpose. Routing this back through useProductSearch would
    // reimpose its 600ms debounce and its >= 2 character gate on an event that
    // already has the exact value to look up.
    const results = await queryClient.fetchQuery({
      queryKey: productKeys.search({ q: value, limit: 1 }),
      queryFn: () => productService.search({ q: value, limit: 1 }),
    });

    const match = results?.[0];
    if (match) {
      handleSelectProduct(match);
      setScannerOpen(false);
      setScanFeedback(`Scanned ${match.name} (${match.sku})`);
    } else {
      // Stay open — the usual cause is a misread, and reopening the camera to
      // try again is the slow path.
      lastScanRef.current = null;
      setScanFeedback(`No product found for barcode ${value}`);
    }
  } catch (cause) {
    // "Could not look up" is a different problem from "not found": stock
    // operations are online-only, so this is most often a dropped connection.
    lastScanRef.current = null;
    const reason = cause instanceof Error ? cause.message : 'the lookup failed';
    setScanFeedback(`Could not look up barcode ${value} (${reason}). Check your connection and scan again.`);
  } finally {
    setScanLookupPending(false);
  }
}}
```

- [ ] **Step 4: Fix the hint text**

The `hint` prop at line 283 currently reads *"Hold a barcode inside the frame. Items are added as they are scanned; scanning the same product again increases its quantity."* — that describes a multi-add flow this modal does not implement. Replace with:

```tsx
hint="Hold the product barcode inside the frame. The matching product is selected and the scanner closes."
```

- [ ] **Step 5: Reset scan state when the scanner is toggled and when the modal closes**

In the "Scan barcode" `Button` `onClick` (around line 257), add `lastScanRef.current = null;` next to the existing `setScanFeedback(null)`. In the `useEffect` that resets on close (lines 101-108), add `setScanFeedback(null);` and `lastScanRef.current = null;` so a reopened modal does not show the previous scan's message.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0 for both.

- [ ] **Step 7: Manual verification**

Start the stack (`docker compose up --build` at the repo root, or `npm run dev` in each package). Then, on `/stock` as an admin:

1. Ensure a product exists with a known `barcode` (set one via Products → edit → Barcode).
2. Add Stock → Scan barcode → present that barcode. Expected: the product is selected, the camera closes, Selling Price prefills, feedback reads `Scanned <name> (<sku>)`.
3. Scan a barcode belonging to no product. Expected: camera stays open, feedback reads `No product found for barcode <value>`.
4. Stop the backend, then scan. Expected: feedback distinguishes a failed lookup from a miss.
5. Repeat step 2 at 375 px wide.

Paste the outcome of each into the task report. Do not mark this task done on typecheck alone — the bug was invisible to typecheck.

- [ ] **Step 8: Commit**

```bash
git add src/components/stock/AddStockModal.tsx
git commit -m "fix(stock): look up scanned barcodes on the server

The scan handler searched the typed-search result list, which is gated on a
two-character query the scanner never sets, so it was always undefined and no
scan ever matched. It also compared against sku rather than barcode."
```

---

### Phase 1 gate

- [ ] **Run the full build with all five tasks merged**

Run: `npm run build`
Expected: exit 0. Do not start phase 2 until this passes.

---

# PHASE 2

### Task 6: Categories — reset bug, controlled expansion, highlight

**Files:**
- Modify: `frontend/src/components/categories/CategoryFormModal.tsx` (reset effect 91-117; `onSubmit` 120-147; props 29-35)
- Modify: `frontend/src/components/categories/CategoryNode.tsx` (local `isExpanded` at 36; props 8-19; children render 172-193)
- Modify: `frontend/src/components/categories/CategoryTree.tsx` (props 10-20; node render 71-86)
- Modify: `frontend/src/app/(protected)/categories/page.tsx` (`showArchived` at 40; `handleFormSuccess` at 126)
- Test: none

**Interfaces:**
- Consumes: `useUrlFilters` (task 1), `useHighlightNew` (task 3), `useToast` (task 2).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Fix the stale-form bug in `CategoryFormModal`**

The reset effect at line 91 depends on `[category, parentCategory, reset]`. Creating twice in a row leaves both `null`, so the deps never change, the effect never re-runs, and react-hook-form keeps the previous values. Add `isOpen` to the deps and bail when closed:

```tsx
  // Populate form when editing. `isOpen` is in the deps on purpose: without it
  // a second create in a row never re-runs (both `category` and
  // `parentCategory` stay null), and the form opens holding the last one's
  // values.
  useEffect(() => {
    if (!isOpen) return;

    if (category) {
      const parentId = typeof category.parent === 'object'
        ? category.parent?._id
        : category.parent;

      reset({
        name: category.name,
        code: category.code,
        description: category.description ?? '',
        parent: parentId ?? null,
        image: category.image ?? '',
        color: (category.color ?? '') as CategoryColor | '',
        sortOrder: category.sortOrder ?? 0,
      });
    } else {
      reset({
        name: '',
        code: '',
        description: '',
        parent: parentCategory?._id ?? null,
        image: '',
        color: '',
        sortOrder: 0,
      });
    }
  }, [isOpen, category, parentCategory, reset]);
```

Also clear any stale mutation error on open, so a failed create does not show its `Alert` above a blank form. Add inside the same effect, after the reset calls:

```tsx
    createMutation.reset();
    updateMutation.reset();
```

and add `createMutation` / `updateMutation` to the dependency array. Do **not** solve the stale-form problem by remounting the form with a `key` — that would also discard the mutation state the error `Alert` reads from.

- [ ] **Step 2: Pass the created record to `onSuccess`**

Change the prop type (line 34) to `onSuccess?: (created: Category) => void;` and capture the mutation result in `onSubmit`:

```tsx
      let saved: Category;
      if (isEditing && category) {
        saved = await updateMutation.mutateAsync({ id: category._id, payload });
      } else {
        saved = await createMutation.mutateAsync(payload);
      }

      onSuccess?.(saved);
      onClose();
```

If `useCreateCategory` / `useUpdateCategory` do not already resolve to the saved `Category`, read `frontend/src/hooks/useCategories.ts` and thread it through — the page needs the new `_id` and there is no other way to get it.

- [ ] **Step 3: Make expansion controlled in `CategoryNode`**

Delete `const [isExpanded, setIsExpanded] = useState(level === 0);` (line 36) and the local `toggleExpand`. Add to `CategoryNodeProps`:

```tsx
  /** Ids of every currently expanded node. Owned by CategoryTree. */
  expandedIds: Set<string>;
  onToggleExpand: (categoryId: string) => void;
  /** Id to mark as newly created, if any. */
  highlightedId?: string | null;
  /** Ring + scroll props from useHighlightNew, keyed by category id. */
  getHighlightProps?: (id: string) => { ref?: (node: HTMLElement | null) => void; className: string };
```

Derive expansion and wire the toggle:

```tsx
  const isExpanded = expandedIds.has(category._id);
  const hasChildren = category.children && category.children.length > 0;

  const toggleExpand = () => {
    if (hasChildren) onToggleExpand(category._id);
  };
```

Spread the highlight props onto the existing category row `div` (line 50) — merge with its current `className`, do not replace it:

```tsx
  const highlight = getHighlightProps?.(category._id) ?? { className: '' };
  const isNew = highlightedId === category._id;
```

```tsx
      <div
        ref={highlight.ref}
        className={`
          flex items-center gap-2 py-2 px-3 rounded-lg
          hover:bg-gray-50 dark:hover:bg-gray-800
          transition-colors duration-150
          group
          ${highlight.className}
        `}
        style={{ paddingLeft: `${level * 24 + 12}px` }}
      >
```

Render a New badge beside the existing Archived badge (after line 114):

```tsx
        {isNew && (
          <Badge variant="warning" size="sm">
            New
          </Badge>
        )}
```

Forward all four new props to the recursive `<CategoryNode>` at line 180.

Note: the existing row carries `transition-colors duration-150`. Leave it — it is pre-existing and not part of this change. Add no new transition.

- [ ] **Step 4: Own `expandedIds` in `CategoryTree`**

Add to `CategoryTreeProps`:

```tsx
  /** Ancestor chain to force open, e.g. after creating a subcategory. */
  expandPath?: string[];
  highlightedId?: string | null;
  getHighlightProps?: (id: string) => { ref?: (node: HTMLElement | null) => void; className: string };
```

Own the state, seeding it with the level-0 ids so the previous "roots start open" behaviour survives, and union in `expandPath` when it changes:

```tsx
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Roots default to expanded, matching the behaviour CategoryNode used to
  // implement locally with useState(level === 0).
  const rootIds = useMemo(() => categories.map((c) => c._id).join(','), [categories]);
  const [seededRoots, setSeededRoots] = useState('');
  if (rootIds !== seededRoots) {
    setSeededRoots(rootIds);
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const category of categories) next.add(category._id);
      return next;
    });
  }

  // A newly created subcategory can sit under a collapsed parent, where it is
  // not rendered at all. Opening its whole ancestor chain is what makes the
  // highlight reachable.
  const pathKey = (expandPath ?? []).join(',');
  const [seededPath, setSeededPath] = useState('');
  if (pathKey !== seededPath) {
    setSeededPath(pathKey);
    if (expandPath?.length) {
      setExpandedIds((current) => new Set([...current, ...expandPath]));
    }
  }

  const handleToggleExpand = useCallback((categoryId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);
```

Derive-during-render (the `prevX !== x` pattern above) rather than `useEffect`: the project's React Compiler lint rejects `setState` in an effect body, and the pattern is already established in `components/products/ProductFilters.tsx:82-96`. Follow that precedent.

Pass `expandedIds`, `onToggleExpand={handleToggleExpand}`, `highlightedId` and `getHighlightProps` to each `<CategoryNode>` at line 74.

- [ ] **Step 5: Wire the page**

In `frontend/src/app/(protected)/categories/page.tsx`:

Declare the defaults at module scope (required by `useUrlFilters`):

```tsx
const CATEGORY_FILTER_DEFAULTS = { archived: false };
```

Replace `const [showArchived, setShowArchived] = useState(false);` with:

```tsx
  const { filters, setFilters } = useUrlFilters(CATEGORY_FILTER_DEFAULTS);
  const showArchived = filters.archived;
```

and the toggle button's handler with `onClick={() => setFilters({ archived: !showArchived }, 'push')}`.

Add the highlight and toast:

```tsx
  const { highlightedId, highlight, getHighlightProps } = useHighlightNew();
  const { show } = useToast();
  const [expandPath, setExpandPath] = useState<string[]>([]);
```

Replace `handleFormSuccess` (line 126) with a version that receives the saved record, opens its ancestors, and highlights it. Compute the ancestor chain by walking the tree already in memory:

```tsx
  /** Ids from the root down to (but not including) `targetId`. */
  const findAncestorPath = useCallback(
    (nodes: Category[], targetId: string, trail: string[] = []): string[] | null => {
      for (const node of nodes) {
        if (node._id === targetId) return trail;
        const found = node.children
          ? findAncestorPath(node.children, targetId, [...trail, node._id])
          : null;
        if (found) return found;
      }
      return null;
    },
    []
  );

  const handleFormSuccess = useCallback(
    async (saved: Category) => {
      handleFormClose();
      // The tree must hold the new node before its ancestors can be located or
      // its row scrolled to, so wait for the refetch rather than firing and
      // hoping.
      const { data: fresh } = await refetch();
      const path = findAncestorPath(fresh ?? [], saved._id) ?? [];
      setExpandPath(path);
      highlight(saved._id);
      show(`Saved "${saved.name}"`);
    },
    [refetch, findAncestorPath, highlight, show, handleFormClose]
  );
```

Pass `expandPath`, `highlightedId` and `getHighlightProps` to `<CategoryTree>` (line 227).

- [ ] **Step 6: Wrap the page in Suspense**

`useSearchParams()` opts a route into client rendering and Next will fail the build without a boundary. Follow the existing precedent in `app/(public)/(auth)/login/login.tsx`: move the page body into an inner component and export a default that wraps it:

```tsx
export default function CategoriesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Spinner size="lg" /></div>}>
      <CategoriesPageContent />
    </Suspense>
  );
}
```

- [ ] **Step 7: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: exit 0 for all three.

- [ ] **Step 8: Manual verification**

On `/categories` as an admin:

1. Collapse a root category. Add a subcategory under it. Expected: the parent expands, the page scrolls the new row into view, the row shows a yellow ring and a `New` badge, both gone after ~5s, and a toast reads `Saved "<name>"`.
2. Create a category, then immediately click Add Category again. Expected: every field blank, no leftover error `Alert`.
3. Click "Add subcategory" on a row. Expected: Parent Category is preselected to that row.
4. Toggle Show archived. Expected: the URL becomes `/categories?archived=true`; refresh keeps archived visible; Back returns to the live-only view.
5. Expand a few nodes, toggle Show archived, toggle back. Expected: expansion is not lost.
6. Repeat step 1 at 375 px wide.

- [ ] **Step 9: Commit**

```bash
git add src/components/categories "src/app/(protected)/categories/page.tsx"
git commit -m "feat(categories): show the record a create just added

Expansion moves from per-node local state up to CategoryTree so the page can
open a new subcategory's whole ancestor chain before scrolling to it, and the
form's reset effect now re-runs on open instead of only when the edited record
changes, which left a second create holding the first one's values."
```

---

### Task 7: Products list — URL-backed filters

**Files:**
- Modify: `frontend/src/app/(protected)/products/page.tsx` (filter state 28-38; handlers; pagination)
- Modify: `frontend/src/components/products/ProductFilters.tsx` — **only if needed**; read step 2 before touching it
- Test: none

**Interfaces:**
- Consumes: `useUrlFilters` (task 1), `useHighlightNew` (task 3).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Move filter state into the URL**

At module scope in `products/page.tsx`:

```tsx
// Module scope, not an inline literal: useUrlFilters memoises on this object's
// identity, and a fresh literal each render would rebuild `filters` each render
// — which resets ProductFilters' local input state on every keystroke.
const PRODUCT_FILTER_DEFAULTS = {
  page: 1,
  limit: 12,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  // Deleting a product is a soft delete — it stays in the collection with
  // isActive false and isDiscontinued true. Without this the catalog kept
  // listing everything ever deleted, and a deleted product stayed on screen
  // after the delete succeeded. Archived rows are reachable through the
  // Status filter.
  active: 'true',
  search: '',
  category: '',
  brand: '',
  motorcycleModel: '',
  minPrice: '',
  maxPrice: '',
  new: '',
} as const satisfies Record<string, string | number>;
```

Replace the `useState<ProductListParams>` block (line 28) with:

```tsx
  const { filters: urlFilters, setFilters, resetFilters } = useUrlFilters(
    PRODUCT_FILTER_DEFAULTS as unknown as Record<string, string | number>
  );
```

`ProductListParams` expects numbers for `minPrice` / `maxPrice` and omits empties, so build the query params separately from the URL state:

```tsx
  const filters: ProductListParams = useMemo(() => ({
    page: Number(urlFilters.page),
    limit: Number(urlFilters.limit),
    sortBy: urlFilters.sortBy as ProductListParams['sortBy'],
    sortOrder: urlFilters.sortOrder as 'asc' | 'desc',
    ...(urlFilters.active ? { active: String(urlFilters.active) } : {}),
    ...(urlFilters.search ? { search: String(urlFilters.search) } : {}),
    ...(urlFilters.category ? { category: String(urlFilters.category) } : {}),
    ...(urlFilters.brand ? { brand: String(urlFilters.brand) } : {}),
    ...(urlFilters.motorcycleModel ? { motorcycleModel: String(urlFilters.motorcycleModel) } : {}),
    ...(urlFilters.minPrice ? { minPrice: Number(urlFilters.minPrice) } : {}),
    ...(urlFilters.maxPrice ? { maxPrice: Number(urlFilters.maxPrice) } : {}),
  }), [urlFilters]);
```

`new` is carried in the URL but deliberately excluded here — it is a UI concern, not a query parameter, and sending it would bust the React Query cache key for no reason.

- [ ] **Step 2: Adapt the `ProductFilters` callbacks**

`ProductFilters` already derives its local input state from the `filters` prop during render, guarded by a reference comparison (`ProductFilters.tsx:82-96`). Because `useUrlFilters` returns a new `filters` object whenever the query string changes, that existing mechanism repopulates the inputs on a Back navigation with **no change to `ProductFilters` itself**. Verify this in step 6 before editing that file; only touch it if the inputs actually fail to repopulate.

Its `onFilterChange` hands back a fresh `ProductListParams` that drops `page`. Map it onto `setFilters`:

```tsx
  const handleFilterChange = useCallback((next: ProductListParams) => {
    setFilters({
      search: next.search ?? '',
      category: next.category ?? '',
      brand: next.brand ?? '',
      motorcycleModel: next.motorcycleModel ?? '',
      active: next.active ?? '',
      minPrice: next.minPrice?.toString() ?? '',
      maxPrice: next.maxPrice?.toString() ?? '',
      sortBy: next.sortBy ?? 'createdAt',
      sortOrder: next.sortOrder ?? 'desc',
      // Already debounced by 800ms inside ProductFilters, so this is a commit,
      // not a keystroke — push, so Back undoes an applied filter.
    }, 'push');
  }, [setFilters]);
```

and pass `onReset={resetFilters}`.

- [ ] **Step 3: Pagination**

Change the existing page buttons to `setFilters({ page: <n> }, 'push')`. Because `setFilters` only resets `page` when some *other* key changes, a pure page change is preserved.

- [ ] **Step 4: Highlight a freshly created product**

```tsx
  const { highlightedId, highlight, getHighlightProps } = useHighlightNew();
  const newId = String(urlFilters.new ?? '');

  // Derive-during-render rather than useEffect — the React Compiler lint
  // rejects setState in an effect body. Mirrors ProductFilters.tsx:82-96.
  const [seenNewId, setSeenNewId] = useState('');
  if (newId && newId !== seenNewId) {
    setSeenNewId(newId);
    highlight(newId);
  }
```

Pass `highlightedId` and `getHighlightProps` down to `ProductGrid`, which spreads them onto each card wrapper (its `key={product._id}` element at `ProductGrid.tsx:75`) and renders a `New` badge when the id matches. Add the two props to `ProductGridProps` as optional.

- [ ] **Step 5: Wrap in Suspense**

Same pattern as task 6 step 6 — inner content component, default export wrapping it in `<Suspense>` with a `Spinner` fallback.

- [ ] **Step 6: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: exit 0 for all three.

- [ ] **Step 7: Manual verification**

On `/products`:

1. Type a search term, pick a category, go to page 3. Expected: the URL reads e.g. `/products?page=3&search=brake&category=<id>`.
2. Open a product, then press Back. Expected: page 3, the search box and category still populated. **If the inputs come back empty, that is the case where `ProductFilters` needs editing — go back to step 2.**
3. Copy the URL into a new tab. Expected: the same view.
4. Change the category while on page 3. Expected: the page resets to 1.
5. Type in the search box. Expected: history is not flooded — one Back press returns to the pre-search view, not one press per character.
6. Visit `/products?new=<some product id>`. Expected: that card is ringed and scrolled to, badge clears after ~5s.
7. Visit `/products?page=abc`. Expected: page 1, no crash.
8. Repeat steps 1-2 at 375 px wide.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(protected)/products/page.tsx" src/components/products
git commit -m "feat(products): keep list filters in the URL

Opening a product from a filtered, paginated grid and pressing Back returned an
unfiltered page 1, because the filters lived in component state that unmounted
with the page."
```

---

### Task 8: Product forms — collapsible sections and stay-on-form create

**Files:**
- Modify: `frontend/src/app/(protected)/products/new/page.tsx` (Pricing 517, Tags 606, Specifications 653; `onSubmit` 172-222)
- Modify: `frontend/src/app/(protected)/products/[id]/edit/page.tsx` (its own Pricing, Tags, Specifications blocks)
- Test: none

**Interfaces:**
- Consumes: `CollapsibleSection` (task 4) from `@/components/ui`, `useToast` (task 2) from `@/components/ui/Toast`.
- Produces: nothing later tasks depend on.

These two files are independent copies of the same form; both need the same treatment. **Do not deduplicate them.**

- [ ] **Step 1: Wrap the three optional sections on the create form**

In `products/new/page.tsx`, replace the outer `<div className="bg-white ... p-6">` + `<h2>` of the **Pricing**, **Tags** and **Specifications** blocks with `CollapsibleSection`. Leave **Basic Information** as a plain always-open block. Example, for Tags:

```tsx
        <CollapsibleSection title="Tags" defaultOpen={false} badge={tags.length} error={!!errors.tags}>
          {/* existing inner markup, unchanged */}
        </CollapsibleSection>
```

For Pricing use `error={!!errors.costPrice || !!errors.sellingPrice}` and no badge. For Specifications use `error={!!errors.specifications}` and `badge={filledSpecCount}` where:

```tsx
  const specifications = useWatch({ control, name: 'specifications' });
  const filledSpecCount = useMemo(() => {
    if (!specifications) return 0;
    const { dimensions, ...rest } = specifications;
    const scalars = Object.values(rest).filter((v) => v !== undefined && v !== '' && v !== null).length;
    const dims = Object.values(dimensions ?? {}).filter((v) => v !== undefined && v !== null).length;
    return scalars + dims;
  }, [specifications]);
```

`error` forcing a section open is the load-bearing part: a hidden invalid field otherwise blocks the submit with nothing visible to explain it.

- [ ] **Step 2: Stay on the form after a create**

Add the banner state and toast next to the existing `pendingImages` / `imageError` state:

```tsx
  const { show } = useToast();
  // The user's only handle on the record they just made, since the form does
  // not navigate to it any more. Persists until the next submit or dismissal.
  const [lastCreated, setLastCreated] = React.useState<{ id: string; name: string } | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement | null>(null);
```

Replace the tail of `onSubmit` (line 219, `router.push(...)`) with:

```tsx
      const uploaded = await uploadPendingImages(targetId);
      // A failed upload leaves a perfectly good product behind. Keep the
      // message on screen, keep the form as it is, and show no success banner.
      if (!uploaded) return;

      if (isEditing) {
        router.push(`/products/${targetId}`);
        return;
      }

      const createdName = cleanData.name ?? 'product';
      reset();
      setPendingImages([]);
      setImageError(null);
      setLastCreated({ id: targetId, name: createdName });
      show(`Created "${createdName}"`, {
        action: { label: 'View', href: `/products/${targetId}` },
      });
      nameInputRef.current?.focus();
```

`reset()` with no argument restores the `defaultValues` the form was constructed with — do not hand it a fresh literal.

- [ ] **Step 3: Render the banner**

Directly above the existing error `Alert` in the form:

```tsx
        {lastCreated && (
          <div className="flex items-center gap-3 rounded-lg border-2 border-yellow-400 bg-white px-4 py-3">
            <p className="flex-1 text-sm font-medium text-black">
              Created &ldquo;{lastCreated.name}&rdquo;
            </p>
            <Link
              href={`/products/${lastCreated.id}`}
              className="text-sm font-semibold text-black underline"
            >
              View product
            </Link>
            <button
              type="button"
              onClick={() => setLastCreated(null)}
              aria-label="Dismiss"
              className="text-gray-400 hover:text-black"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
```

`Link` and `X` are already imported in this file.

- [ ] **Step 4: Focus the Name input**

The Name field uses `{...register('name')}`, whose `ref` must not be dropped. Merge the two refs:

```tsx
              <Input
                label="Product Name"
                placeholder="e.g., Cordless Power Drill 20V"
                error={errors.name?.message}
                {...register('name', {
                  // register() owns this ref; capture it alongside rather than
                  // replacing it, or RHF loses the field entirely.
                  ...{},
                })}
                ref={(node) => {
                  register('name').ref(node);
                  nameInputRef.current = node;
                }}
              />
```

If `Input` does not forward its ref, check `components/ui/Input.tsx` first: if it is not already a `forwardRef` component, make it one (it must be, since `register` is already spread onto it — verify rather than assume). If merging refs proves awkward, the acceptable fallback is `setFocus('name')` from `useForm`, which needs no ref plumbing at all — prefer that if it works.

- [ ] **Step 5: Keep the submit button a single `Create Product`**

Do not add a second submit variant.

- [ ] **Step 6: Wrap the edit form's sections**

In `products/[id]/edit/page.tsx`, wrap its **Pricing**, **Tags** and **Specifications** blocks in `CollapsibleSection` too. Leave **Status**, **Product Images** and **Basic Information** always open. Here `defaultOpen` must reflect whether the loaded product already holds data — hiding existing values behind a chevron would be worse than the current always-open form:

```tsx
  const hasPricing = !!product && (product.costPrice > 0 || product.sellingPrice > 0);
  const hasTags = (product?.tags?.length ?? 0) > 0;
  const hasSpecs = !!product?.specifications && Object.values(product.specifications).some(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !(typeof value === 'object' && Object.values(value).every((v) => v === undefined || v === null))
  );
```

The edit page keeps its existing `router.push('/products/' + productId)` on save. Do not give it the banner or the reset.

- [ ] **Step 7: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: exit 0 for all three.

- [ ] **Step 8: Manual verification**

1. `/products/new`: Pricing, Tags and Specifications are collapsed; Basic Information is not.
2. Fill in only the required fields and submit. Expected: no navigation; the form clears; the three sections are collapsed again; focus is in Name; the banner reads `Created "<name>"` with a working `View product` link; a toast appears.
3. Immediately create a second product. Expected: no leftover values from the first.
4. Add a photo, create with the backend stopped so the upload fails. Expected: the existing upload-failure message shows, the form does **not** clear, and no success banner appears.
5. Submit with an invalid Cost Price while Pricing is collapsed. Expected: Pricing opens by itself and the field error is visible.
6. Collapse Specifications, fill nothing, submit. Expected: the product saves — collapsed fields still submit their values.
7. `/products/<id>/edit` on a product that has specifications. Expected: Specifications is open on load. On one with none: collapsed.
8. Repeat steps 1-3 at 375 px wide.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(protected)/products/new/page.tsx" "src/app/(protected)/products/[id]/edit/page.tsx"
git commit -m "feat(products): stay on the form after creating a product

Consecutive entry is the reported workflow, and navigating to the detail page
made every extra product a round trip. The three optional sections now collapse
so the submit button is reachable without scrolling, and open themselves if
they hold an invalid field."
```

---

### Task 9: Stock list — URL-backed filters

**Files:**
- Modify: `frontend/src/app/(protected)/stock/page.tsx` (filter state 39-47)
- Test: none

**Interfaces:**
- Consumes: `useUrlFilters` (task 1).
- Produces: nothing.

- [ ] **Step 1: Move filter state into the URL**

At module scope:

```tsx
const STOCK_FILTER_DEFAULTS = {
  search: '',
  branch: '',
  lowStock: false,
  outOfStock: false,
  sortField: 'product.name',
  sortOrder: 'asc',
};
```

Replace the six `useState` declarations at lines 39-47 with:

```tsx
  const { filters, setFilters } = useUrlFilters(STOCK_FILTER_DEFAULTS);
  const search = String(filters.search);
  const selectedBranch = String(filters.branch);
  const showLowStock = Boolean(filters.lowStock);
  const showOutOfStock = Boolean(filters.outOfStock);
  const sortField = String(filters.sortField);
  const sortOrder = filters.sortOrder as 'asc' | 'desc';
```

and route every existing setter through `setFilters` — e.g. `setSearch(v)` becomes `setFilters({ search: v })` (replace mode, it is a text input), `setSelectedBranch(v)` becomes `setFilters({ branch: v }, 'push')`.

Leave the modal state (`restockStock`, `adjustStock`, `historyStock`, `showAddStock`) in `useState`. Deep-linking a modal is out of scope.

- [ ] **Step 2: Clamp the branch for non-admins**

A branch id in the URL that the user cannot access must be ignored, not sent. Read `frontend/src/providers/BranchProvider.tsx` for the exact shape of `useBranchContext()`, then:

```tsx
  // A hand-edited or shared URL can name a branch this user cannot see. The
  // backend rejects it (utils/branchScope.js), but a 403 on page load is a
  // worse experience than silently showing the branch they do have.
  const effectiveBranch = showAdminActions ? selectedBranch : (userBranchId ?? '');
```

Use `effectiveBranch` for every query and for the branch `<select>`'s value. Do not rewrite the URL to correct it — that would fight the Back button.

- [ ] **Step 3: Wrap in Suspense**

Same pattern as task 6 step 6.

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: exit 0 for all three.

- [ ] **Step 5: Manual verification**

On `/stock`:

1. Search, pick a branch, toggle Low stock. Expected: the URL carries all three.
2. Open a stock history modal, close it, refresh. Expected: the filters survive.
3. Copy the URL to a new tab. Expected: the same filtered view.
4. As a **non-admin**, visit `/stock?branch=<another branch id>`. Expected: their own branch's stock, no 403, no crash.
5. Repeat step 1 at 375 px wide.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(protected)/stock/page.tsx"
git commit -m "feat(stock): keep list filters in the URL"
```

---

## Final gate

- [ ] `npm run build` from `frontend/` — exit 0
- [ ] `npm run lint` from `frontend/` — exit 0
- [ ] `npm test` from `backend/` — still 15 suites / 474 tests green, or, if `mongodb-memory-server` cannot download its binary in this sandbox, note that this is an environment failure and confirm no backend file was modified by this plan (`git diff --stat master -- backend/` is empty)
- [ ] Every manual check in tasks 5-9 performed and its outcome reported

## Self-review notes

- **Spec coverage:** primitives → tasks 1-4; C1 categories → task 6; C2 products list → task 7; C3 product forms → task 8; C4 stock → task 9; C5 barcode → task 5; error handling → task 1 step 1 (`coerce` fallback), task 5 step 3 (lookup-vs-miss), task 8 step 2 (upload failure); testing section → per-task manual checks plus the final gate.
- **Known soft spots, flagged rather than hidden:** task 7 step 2 and task 8 step 4 both contain a "verify before editing" instruction, because whether `ProductFilters` needs changing and whether `Input` forwards refs cannot be settled without running the code. Both name the fallback to take. Neither is a placeholder — the work is specified either way.
