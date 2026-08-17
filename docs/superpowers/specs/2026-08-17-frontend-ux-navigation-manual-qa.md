# Manual QA — frontend UX branch

Branch: `feat/frontend-ux-navigation`
Spec: [2026-08-17-frontend-ux-navigation-design.md](2026-08-17-frontend-ux-navigation-design.md)

**Nothing on this branch has been exercised at runtime.** It passes `tsc --noEmit`,
`npm run lint` (0 errors) and `npm run build` (31 routes, `/categories`, `/products`
and `/stock` still prerendering as static, confirming the three `useSearchParams`
Suspense boundaries). `frontend/` has no test suite, and every agent that worked on
this branch was without a browser. Static verification proves the code compiles and
type-checks; it proves nothing about behaviour.

The barcode bug this branch fixes was itself invisible to typecheck. Treat the list
below as the real acceptance gate.

## Start here — the three highest-risk paths

These are ranked by likelihood of being broken in a way only a click-through reveals.

### 1. The bottom of every page

Open any protected page on a phone-width viewport, scroll to the very bottom, and tap
the last button. It must respond.

An earlier revision made the toast layer a transparent click-swallowing strip across
the bottom ~32 px of every page in the app. The fix marks the empty layer inert. This
takes thirty seconds and covers pages this branch never otherwise touched.

### 2. Barcode scanning in Add Stock

The whole path was rebuilt blind across three fix rounds. Do the sequence in one go,
on a real device with a real barcode:

1. Set a known barcode on a product (Products → edit → Barcode).
2. Stock → **Add Stock** → **Scan barcode** → scan it.
   Expect: product selected, selling price prefilled, camera closes, feedback reads
   `Scanned <name> (<sku>)`.
3. Click **Change**, then **Scan barcode**, and **scan the same product again**.
   Expect: it is accepted. A silent no-op here means the repeat guard is still
   swallowing it — this exact case is what the third fix round exists for.
4. Scan an unknown code. Expect: camera stays open, message names the barcode and
   says no product was found.
5. Stop the backend, then scan. Expect: a message that distinguishes *could not look
   up* from *not found*.
6. Repeat step 2 at 375 px wide.

### 3. Creating a second category under the same collapsed parent

1. Collapse a parent, create a subcategory under it. Expect: parent expands, page
   scrolls to the row, yellow ring and `New` badge, both gone after ~5 s, toast reads
   `Created "<name>"`.
2. Wait for the ring to clear, then create a **second** subcategory under that **same**
   parent. This is what the nonce fix is for — the first version silently did nothing
   the second time.
3. Collapse a root by hand, then create any category. The collapsed root must **stay**
   collapsed.
4. Create a category, then immediately click **Add Category** again. Every field must
   be blank, with no leftover error banner.
5. Use **Add subcategory** on a row — Parent Category must be preselected.
6. Edit an existing category. It must **not** get a `New` badge, and the toast must
   read `Updated "<name>"`.

## Products list

1. Search, pick a category, go to page 3. The URL should carry all three.
2. Open a product, press Back. Page 3, search box and category still populated.
3. Paste that URL into a new tab — same view.
4. Change the category while on page 3 — page resets to 1.
5. Type in the search box, then press Back once. It should return to the pre-search
   view, not step back one character at a time.
6. Status filter → **Active + archived**. It must *stay* selected. An earlier revision
   snapped it back to "Active only" about 800 ms later. Refresh and confirm it survives.
7. Visit `/products?page=abc` — page 1, no crash.
8. Repeat 1–2 at 375 px.

## Product create / edit

1. `/products/new` — Pricing, Tags and Specifications start collapsed; Basic
   Information does not.
2. Fill only the required fields and submit. Expect: no navigation, form clears,
   **the three sections are collapsed again**, focus in Name, banner reads
   `Created "<name>"` with a working **View product** link, toast appears.
3. Create a second product immediately — no leftover values from the first.
4. Open Pricing, type a real price, submit. The section must be collapsed again
   afterwards.
5. Submit with an invalid Cost Price while Pricing is collapsed — Pricing must open
   itself with the error visible. Then fix the value: the section must **stay open**,
   not fold away as you type.
6. Collapse Specifications, leave it empty, submit — the product saves. (Collapsed
   fields must still submit their values.)
7. Add a photo, stop the backend, submit. Expect: the upload-failure message shows,
   the form does **not** clear, no success banner, no toast.
8. `/products/<id>/edit` on a product that has specifications — Specifications open on
   load. On one without — collapsed.
9. Repeat 1–3 at 375 px.

## Stock

1. Type `brake` into the search field at normal speed **without pausing**. Watch the
   input, not the results. Characters must not vanish and reappear, and the field must
   not lag a keystroke behind.
2. Type in the search box and then, within about a second, tick **Low Stock** or change
   the branch. The tick must **stick** — an earlier revision let the pending search
   write silently undo it.
3. Search, pick a branch, toggle Low stock — the URL carries all three.
4. Open a stock history modal, close it, refresh — filters survive, modal does not
   reopen.
5. Paste the URL into a new tab — same filtered view.
6. As a **non-admin**, visit `/stock?branch=<another branch id>`. Expect: their own
   branch's stock, no 403, no crash.
7. Repeat 3 at 375 px.

## Known follow-ups

Real, deliberately not fixed on this branch. None blocks merge.

- **Barcode search cannot confirm an exact match.** `ProductSearchResult` carries no
  `barcode` field, and the backend search is a substring `$or` across five fields. The
  branch now refuses to auto-select when more than one product matches, but a code that
  uniquely substring-matches one *wrong* product is still selected. The name and SKU are
  shown before anything is written, so a human can catch it. Closing it properly needs a
  backend change: `barcode` in the search projection, or an exact-match endpoint.
- **Stale-snapshot hazard in `useUrlFilters.setFilters`.** It merges from a closed-over
  `filters`, so any future consumer that debounces a single key can write from a stale
  snapshot. Fixed locally in `StockFilters`; the class-level fix belongs in the hook.
- **Products `Clear all` can be partially undone** if the user types inside the router
  transition immediately after pressing it. Narrow window.
- **The branch `<select>` is a dead control for non-admins.** `StockFilters` renders it
  unconditionally and `GET /branches` returns every branch by name, so a non-admin sees
  other branches and their click silently snaps back. Also `hasActiveFilters` is now
  always true for them, so "Clear filters" is permanently visible and does nothing.
- **Categories no longer scroll to an edited row.** The scroll and the `New` badge came
  from the same ref, so suppressing the badge on edits suppressed both. An edit that
  reparents a category under a collapsed node is confirmed only by the toast.
- **The two product form files are still duplicates.** `products/new/page.tsx` and
  `products/[id]/edit/page.tsx` are independent ~700-line copies, and `ProductForm`'s
  `isEditing` branch is unreachable. Pre-existing, explicitly out of scope here.
