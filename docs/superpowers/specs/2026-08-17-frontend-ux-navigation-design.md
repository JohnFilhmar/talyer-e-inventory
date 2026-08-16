# Frontend UX: navigation state, post-create feedback, form ergonomics

Date: 2026-08-17
Status: approved, ready for implementation planning
Scope: `frontend/` only. No backend change is required by any item in this spec.

## Problem

The deployed app is in the hands of real users. Their reports cluster into four
failures, all of them frontend:

1. **List state does not survive navigation.** Opening a product from a filtered,
   paginated grid and pressing Back returns an unfiltered page 1.
2. **A newly created record is invisible.** After a successful create the list
   refetches, but nothing tells the user which row is theirs or scrolls to it.
   For categories the new record may not render at all.
3. **The create-category form does not clear between creates.** The second
   create opens pre-filled with the first one's values.
4. **Creating products in a run is slow.** The form always navigates away on
   success, and three optional sections push the submit button far below the
   fold.

Plus one outright bug: **barcode scanning in Add Stock never matches a product.**

## Verified root causes

Each was read out of the code, not inferred.

| Symptom | Cause |
| --- | --- |
| Filters lost on nav | `app/(protected)/products/page.tsx:28` holds `ProductListParams` in `useState`. `app/(protected)/stock/page.tsx:39-47` and `app/(protected)/categories/page.tsx:40` do the same. No file under `app/(protected)/` reads `useSearchParams`. |
| Category form retains old data | `components/categories/CategoryFormModal.tsx:91-117` runs its `reset()` in an effect keyed on `[category, parentCategory, reset]`. Create-then-create leaves both `null`; the deps never change, the effect never re-runs, and RHF keeps the previous values. |
| New category invisible | `components/categories/CategoryNode.tsx:36` — `const [isExpanded, setIsExpanded] = useState(level === 0)`. Expansion is node-local state with no external control, so a new subcategory under a collapsed parent is never rendered. `categories/page.tsx:126` `handleFormSuccess` only calls `refetch()`. |
| Product form long / no re-entry | `app/(protected)/products/new/page.tsx:219` unconditionally `router.push('/products/' + targetId)`. Pricing (l.517), Tags (l.606), Specifications (l.653) are always-expanded sections. |
| Barcode scan never matches | `components/stock/AddStockModal.tsx:274`: `searchResults?.find((product) => product.sku === value)`. `searchResults` comes from `useProductSearch(productSearch, 10)`, and `hooks/useProducts.ts:101` gates that query with `enabled: debouncedQuery.length >= 2`. The scanner never writes `productSearch`, so `searchResults` is `undefined` whenever a scan fires — the branch is unreachable. Independently, the comparison uses `sku` and ignores `barcode`. |

The backend already supports the barcode lookup: `backend/src/controllers/
productController.js:269` includes `{ barcode: pattern }` in the `/products/search`
`$or`. No backend work.

## Decisions taken

Recorded so the implementation does not relitigate them.

- **List state lives in the URL**, via `useSearchParams` + `router.replace/push`.
  Chosen over a Zustand store (loses state on refresh, Back does not restore) and
  over a sessionStorage snapshot (invisible to the user, stale across tabs). The
  URL also makes a filtered view shareable between staff on different devices.
- **After creating a product the form stays put**, resets, and shows a persistent
  banner linking to the created record. Chosen over navigating to the detail page
  with an "Add another" button, because consecutive entry is the reported
  workflow and this costs zero navigations.
- **Barcode scan selects one product and closes the camera.** Chosen over keeping
  the camera open and over a continuous multi-add queue (which would need a new
  multi-row form and a bulk endpoint).
- **First pass covers Products, Categories, Stock.** Sales, services, suppliers,
  branches, motorcycle-models and users keep their current behaviour; the
  primitives built here are designed to be reused there later.
- **No CSS transitions or animations are added.** `frontend/docs/
  Frontend-Guidelines.md` forbids them and `app/globals.css` currently defines
  exactly one keyframe (`spin`, for the loading spinner). The requested
  "highlight fadeout" is therefore implemented as an instant ring that is removed
  by a timer, not as a fade. `scrollIntoView` uses `behavior: 'smooth'` only when
  `prefers-reduced-motion` is not set, falling back to `'auto'`.
- **Palette holds.** Highlight styling is `ring-2 ring-yellow-400`; the "New"
  badge is yellow-400 background with black text. No new colours.

## Architecture

Four new primitives, then four consumers. The primitives are independent of each
other; the consumers depend only on primitives, never on each other.

```
ui/Toast.tsx + ToastProvider ──┐
ui/CollapsibleSection.tsx ─────┼──> products/new/page.tsx  (product form)
hooks/useUrlFilters.ts ────────┼──> products/page.tsx      (product list)
hooks/useHighlightNew.ts ──────┼──> categories/page.tsx    (+ CategoryTree/Node)
                               └──> stock/page.tsx         (stock list)

components/stock/AddStockModal.tsx  (barcode fix — depends on nothing)
```

### Primitive 1 — `hooks/useUrlFilters.ts`

A typed adapter between a filter object and the query string.

```ts
export function useUrlFilters<T extends Record<string, unknown>>(
  defaults: T,
  options?: { parse?: Partial<{ [K in keyof T]: (raw: string) => T[K] }> }
): {
  filters: T;
  setFilters: (next: Partial<T>, mode?: 'push' | 'replace') => void;
  resetFilters: () => void;
};
```

Behaviour:

- `filters` is derived from `useSearchParams()` on every render, merged over
  `defaults`. It is **not** mirrored into `useState` — the URL is the single
  source of truth, so Back and refresh work without reconciliation code.
- Values equal to their default are **omitted** from the query string, so a
  pristine list is a bare `/products`.
- Types are recovered on parse: a key whose default is a `number` parses with
  `Number`, a `boolean` default parses `'true'`/`'false'`, everything else stays
  a string. `options.parse` overrides per key for anything else (e.g. enums).
- `setFilters` merges the partial over current filters. **When any key other than
  `page` changes, `page` resets to its default** — otherwise changing a filter
  while on page 5 lands on an empty page.
- `mode` defaults to `'replace'`. Callers pass `'push'` for commits the user
  should be able to undo with Back (page change, applying a filter); typing into
  a debounced search box must stay `'replace'` or every keystroke becomes a
  history entry.
- Pages that use it must render inside a `<Suspense>` boundary, because
  `useSearchParams()` opts a route into client rendering in the App Router.
  Existing precedent: `app/(public)/(auth)/login/login.tsx:17`.

### Primitive 2 — `components/ui/Toast.tsx` and `ToastProvider`

There is no notification primitive today; `app/(protected)/users/page.tsx:105`
carries the comment `// Optionally show a toast notification` in place of one.

```ts
export function useToast(): {
  show: (message: string, options?: { variant?: 'success' | 'error'; action?: { label: string; href: string } }) => void;
};
```

- Provider mounted in `app/(protected)/layout.tsx`, inside `BranchProvider`.
- Fixed bottom-right on desktop, full-width bottom on mobile (mobile-first is a
  hard requirement in the guidelines).
- Auto-dismiss after 5s, dismissible by button. Appears and disappears instantly
  — no transition.
- `role="status"` and `aria-live="polite"`, so the change is announced.
- Success = yellow-400 border with black text; error = black background, red
  text, matching the existing danger convention.

### Primitive 3 — `hooks/useHighlightNew.ts`

```ts
export function useHighlightNew(durationMs?: number): {
  highlightedId: string | null;
  highlight: (id: string) => void;
  getHighlightProps: (id: string) => { ref?: React.Ref<HTMLElement>; className: string };
};
```

- `highlight(id)` records the id and starts a timer (default 5000 ms) that clears
  it. Calling it again restarts the timer against the new id.
- The element registered for the current `highlightedId` receives a callback ref;
  when that ref attaches, the hook scrolls it into view
  (`{ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' }`).
  Scrolling on ref-attach rather than in an effect is what makes it work for a
  row that only just appeared in the DOM after a refetch.
- `className` is `'ring-2 ring-yellow-400 ring-offset-2'` while highlighted, `''`
  otherwise. Consumers render their own "New" badge off `highlightedId`.
- The timer is cleared on unmount.

### Primitive 4 — `components/ui/CollapsibleSection.tsx`

```tsx
<CollapsibleSection title="Pricing" defaultOpen={false} badge={3} error={hasFieldError}>
  …
</CollapsibleSection>
```

- Header is a `<button type="button">` — **must** be `type="button"`, or clicking
  it inside the product form submits the form.
- Collapsed content is unmounted or `hidden`; either way the inputs must remain
  **registered with react-hook-form** so collapsed values still submit. Using
  `hidden` on a wrapper `div` is the simpler guarantee and is preferred.
- `badge` renders a count next to the title (`Tags (3)`), so a collapsed section
  advertises that it holds data.
- `error` forces the section open and marks the header, so a validation failure
  in a collapsed section is never invisible. This is load-bearing: a hidden
  invalid field otherwise blocks submit with no visible reason.
- Exported from `components/ui/index.ts` alongside the other primitives.

## Consumers

### C1 — Categories

Files: `app/(protected)/categories/page.tsx`,
`components/categories/CategoryFormModal.tsx`,
`components/categories/CategoryTree.tsx`, `components/categories/CategoryNode.tsx`.

1. **Fix the reset bug.** Add `isOpen` to the reset effect's dependency array and
   return early when `!isOpen`, so every open re-runs the reset. Do not solve it
   by remounting the form with a `key` — that would also discard the mutation
   state the error `Alert` reads from.
2. **Lift expansion state.** `CategoryNode`'s local `isExpanded` moves up to
   `CategoryTree`, which owns `expandedIds: Set<string>` and passes
   `isExpanded` + `onToggleExpand` down. `CategoryTree` gains an
   `expandPath?: string[]` prop; when it changes, those ids are unioned into
   `expandedIds`. Default expansion for level 0 is preserved.
3. **Highlight on create.** `CategoryFormModal`'s `onSuccess` changes signature to
   `onSuccess(created: Category)`. The page computes the created record's ancestor
   chain from the tree it already has, passes it as `expandPath`, and calls
   `highlight(created._id)`. `CategoryNode` renders a `New` badge when its id
   matches and spreads `getHighlightProps`.
4. **`showArchived` moves to the URL** as `?archived=true` via `useUrlFilters`.
5. Toast on create/update success, reusing the same message text as the banner.

### C2 — Products list

File: `app/(protected)/products/page.tsx` (and `components/products/ProductFilters.tsx`
only where it needs to become controlled).

- Every member of `ProductListParams` currently in `useState` moves into
  `useUrlFilters`: `page`, `limit`, `sortBy`, `sortOrder`, `active`, plus whatever
  `ProductFilters` emits (`q`, `category`, `brand`, `minPrice`, `maxPrice`).
- `active: 'true'` stays the default and therefore stays out of the URL until the
  user changes the Status filter. Its existing comment about soft deletes must be
  preserved — it explains why the default is not "all".
- `ProductFilters` holds a `LocalFilters` copy today (l.20); it keeps that for
  debounced typing but must reinitialise from props when the URL changes, so a
  Back navigation repopulates the visible inputs.
- Highlight: if the URL carries `?new=<id>`, highlight that product and strip the
  param on the next `setFilters` call.
- Page changes use `mode: 'push'`; search typing uses `'replace'`.

### C3 — Product form

File: `app/(protected)/products/new/page.tsx` (the shared `ProductForm` used by
both create and edit).

- Wrap **Pricing**, **Tags**, **Specifications** in `CollapsibleSection`.
  - Create mode: all three collapsed.
  - Edit mode: a section opens if the loaded product has any value in it. Do not
    hide existing data behind a chevron.
  - `Basic Information` is never collapsible.
- Success path, create mode only:
  - Do **not** navigate. `reset()` to the same `defaultValues` object the form was
    constructed with, clear `pendingImages` and `imageError`, and move focus to
    the Name input.
  - Set a banner state `{ id, name }` rendering `Created "<name>" · View product`
    with a link to `/products/<id>` and a dismiss button. The banner persists
    until the next submit or dismissal — it is the user's only handle on the
    record they just made.
  - Also fire a toast, for the case where the user has scrolled away from the
    banner.
- Edit mode keeps the existing `router.push('/products/' + targetId)`.
- The existing image-upload-failure path (`uploadPendingImages` returning `false`
  stops the flow and keeps the message on screen) must survive unchanged: on
  failure, do not reset the form and do not show the success banner.
- The submit button stays a single `Create Product`. No second submit variant.

### C4 — Stock list

File: `app/(protected)/stock/page.tsx`.

- `search`, `selectedBranch`, `showLowStock`, `showOutOfStock`, `sortField`,
  `sortOrder` move into `useUrlFilters`.
- Non-admin users are clamped to their own branch by `BranchProvider`; a branch id
  in the URL that the user cannot access must be ignored and replaced with their
  own, not passed to the API. The backend rejects it anyway
  (`utils/branchScope.js`), but a 403 on page load is a worse experience than a
  silent clamp.
- Modal state (`restockStock`, `adjustStock`, `historyStock`, `showAddStock`)
  stays in `useState`. Deep-linking a modal is out of scope.

### C5 — Barcode fix

File: `components/stock/AddStockModal.tsx`.

- Replace the `searchResults?.find(...)` lookup with an imperative server lookup
  on the scanned value:

  ```ts
  const results = await queryClient.fetchQuery({
    queryKey: productKeys.search({ q: value, limit: 1 }),
    queryFn: () => productService.search({ q: value, limit: 1 }),
  });
  ```

  Imperative, not `useQuery`: the lookup is triggered by an event, and routing it
  back through `useProductSearch` reintroduces the 600 ms debounce and the
  `>= 2` character gate for no benefit.
- On a hit: `handleSelectProduct(match)`, `setScannerOpen(false)`, feedback
  `Scanned <name> (<sku>)`.
- On a miss: keep the scanner open, feedback
  `No product found for barcode <value>`.
- On a lookup error (offline, 5xx): feedback must distinguish "could not look up"
  from "not found". The scanner stays open.
- Guard against a double fire: `BarcodeScanner` can emit the same code more than
  once. Ignore a scan while a lookup is in flight, and ignore a repeat of the
  value just resolved.
- Rewrite the `hint` prop at l.283. It currently reads *"Items are added as they
  are scanned; scanning the same product again increases its quantity"*, which
  describes a multi-add flow this modal does not implement. Replace with
  wording for single select.

## Error handling

- Every mutation already surfaces failures through its `error` state and an
  `Alert`; that stays. Toasts are additive and never the only channel for an
  error.
- A malformed or hostile query string must not crash a page. `useUrlFilters`
  falls back to the default for any value that fails to parse — `?page=abc` reads
  as page 1, not `NaN`.
- Offline: `useUrlFilters` touches no network. The barcode lookup can fail
  offline, and per the project's offline scope (stock operations are online-only)
  that surfaces as a message, not a queued action.

## Testing

`frontend` has no test suite, and standing one up is out of scope. Verification is
manual against a running stack, scripted per surface:

1. Create a category under a **collapsed** parent → the parent expands, the page
   scrolls to the new row, the row carries a yellow ring and a `New` badge, both
   gone after ~5s.
2. Create a category, then immediately open Create Category again → every field
   is blank; parent preselection still works when opened via "Add subcategory".
3. Filter products (search + category + page 3), open a product, press Back → the
   grid returns to page 3 with the search box and category still populated.
4. Copy a filtered product URL into a new tab → same view.
5. Create a product → the form clears, focus is on Name, the banner links to the
   new product, and the three optional sections are collapsed again.
6. Edit a product that has specifications → the Specifications section is open on
   load.
7. Submit a product with an invalid field inside a collapsed section → the section
   opens and the error is visible.
8. Add Stock → scan a barcode that exists → the product is selected, the camera
   closes, the selling price prefills.
9. Add Stock → scan an unknown barcode → a clear message, camera stays open.
10. Every screen above at 375 px wide.

`backend` tests are untouched by this work; `npm test` in `backend/` must still be
green, and `npm run lint` plus `npm run build` in `frontend/` must pass.

## Out of scope

- Sales, services, suppliers, branches, motorcycle-models and users list pages.
- Deep-linking modals.
- A continuous multi-scan stock intake flow.
- Any backend change.
- Introducing a frontend test suite.
