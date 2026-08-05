# Mobile App Design Brief — Talyer E-Inventory

Hand this to a designer (human or Claude). It is self-contained: everything
needed to design the screens is here or linked.

---

## The prompt

> You are designing the mobile application for **Talyer E-Inventory**, a
> multi-branch inventory and service-management system for a motorparts and
> automotive repair business in the Philippines. A web app already exists and
> is in production; this is a native companion built with Expo / React Native,
> talking to the same API.
>
> **Design for two viewports, both first-class:**
> - **Phone** — 390×844 baseline (iPhone 14 / typical Android). One-handed use,
>   often while standing at a counter or beside a vehicle.
> - **Tablet** — 820×1180 baseline (iPad-class, portrait and landscape). Used
>   propped on a counter as the primary till.
>
> These are not the same design scaled. A tablet in landscape should use the
> width — master/detail, side-by-side cart and catalog — where a phone stacks
> and relies on navigation. Say explicitly, per screen, what changes between
> them.
>
> **Read `mobile-app/docs/FEATURES.md` first.** It is the authoritative feature
> inventory: every screen, role, endpoint, and behavioural rule. Do not design
> screens for functionality listed there under "Known gaps" — several
> plausible-sounding features (financial reports, customer order tracking,
> notifications) genuinely do not exist in the backend.
>
> Deliver: screen-by-screen layouts for both viewports, the navigation model,
> component states (loading, empty, error, offline, permission-denied), and a
> written rationale for the decisions that are not obvious.

---

## Who uses it, and how

Four roles. **The role changes the app so much that it is closer to three
different apps sharing a shell.** Design the navigation around that.

| Role | Reality of their day | What they need to reach in one tap |
|---|---|---|
| **Salesperson** | Standing at a counter, customer waiting, one hand free. Speed is the whole game. | New sale. Scan. Stock lookup. |
| **Mechanic** | Beside a vehicle, hands dirty, phone in a pocket. Reads more than writes. | My assigned jobs. Update status. Log parts used. |
| **Admin** | Sitting down, reviewing. Manages everything, across all branches. | Everything else — users, branches, catalog, stock, transfers. |
| **Customer** | Registerable but reaches almost nothing today. | Out of scope; do not design a customer experience. |

A salesperson and a mechanic should probably never see the same tab bar.

---

## Screens to design

Grouped by role. Names are the web equivalents; the mobile information
architecture is yours to propose.

### Everyone
- **Login** — email + password. Also forgot-password and reset-password.
- **Offline state** — see the offline section below; this is not one screen but
  a condition affecting all of them.

### Salesperson (and admin)
- **New Sale** — the most important screen in the app. Branch selector,
  product search, **camera barcode scanner**, cart with quantity controls,
  customer details, payment method, amount tendered, totals.
- **Sales list** — filter by status, payment status, branch, date range.
- **Sale detail** — line items, totals, payment, status actions.
- **Invoice** — print/share-friendly receipt.
- **New Service Job** — vehicle details, customer, description, priority,
  optional mechanic assignment.
- **Service list** and **Service detail** — assign mechanic, update status,
  record parts used, update payment.
- **Service invoice**.
- **Stock** — per-branch levels, low-stock view.

### Mechanic
- **My Jobs** — only jobs assigned to them. This is their home screen.
- **Job detail** — update status, record parts used. Read-only on pricing.

### Admin (everything above, plus)
- **Dashboard** — note: no backend aggregate endpoint exists. Design what it
  *should* show and flag that it needs API work, or design something honest
  from data that does exist.
- **Products** — list, detail, create, edit, image management.
- **Categories** — hierarchical, unlimited nesting.
- **Stock adjustments** and **Stock transfers** between branches.
- **Suppliers**.
- **Branches**.
- **Users** — create staff, assign role and branch, activate/deactivate, reset
  password.
- **Sync queue** — see below.

---

## The three things that make this app unusual

Get these right and the rest follows.

### 1. It works offline, and that must be visible

Sales and service orders can be **created with no connection**. They queue
locally and replay when the network returns. Everything else — stock edits,
transfers, admin — requires a connection and fails with a message.

Design needed for:

- **An offline indicator** that is honest. It may claim "you have no
  connection"; it may **not** claim "back online, syncing" the moment
  connectivity returns, because an interface being up does not mean the server
  is reachable.
- **A queued order.** It has *no order number* — `SO-YYYY-NNNNNN` is assigned
  by the server at insert. It must never show a fabricated one. The web app
  shows `Pending sync`. It appears in the list alongside real orders and must
  be visually distinguishable at a glance.
- **A pending count** somewhere persistent, linking to the sync queue.
- **The sync queue screen.** Entries grouped by state: waiting to sync, and
  **rejected**. A rejected entry shows what was attempted and the server's
  reason — most commonly that the stock was sold by another device first — with
  two actions: discard, or retry.

**There is deliberately no "force" or "override" action.** The server is
authoritative. Offering an override would let a user oversell stock. Do not
design one, however much the screen seems to want it.

### 2. The barcode scanner is the speed feature

The counter flow is: open New Sale → scan → scan → scan → take payment. Design
the scanner as a first-class mode of that screen, not a modal detour.

- Camera preview with an aiming guide.
- Front/rear camera switch (only when a second camera exists).
- Each scan adds a line item; scanning the same product again increases its
  quantity.
- Feedback per scan matters: a scan that matched nothing, or a product that is
  out of stock, must say so — silence reads as a broken camera.
- On a tablet propped on a counter, the camera and the cart should be visible
  at once. On a phone they probably cannot be.

### 3. Branch scoping is a hard boundary

A salesperson or mechanic sees exactly one branch and cannot act on another.
An admin sees all of them and needs a branch context that is always
unambiguous — the same screen means different things depending on which branch
is selected, and a mis-set branch selector causes a real-world mistake.

Stock, prices, and orders are all per-branch. The same product can cost
different amounts at different branches.

---

## Visual language

Inherited from the web app and already encoded in
`mobile-app/constants/colors.ts`. Both light and dark are defined.

| Token | Light | Dark |
|---|---|---|
| Brand | `#FBBF24` (yellow-400) | `#F59E0B` |
| Brand soft | `#FEF3C7` | — |
| Background | `#FFFFFF` | `#000000` |
| Surface | `#F3F4F6` | `#111827` |
| Foreground | `#000000` | `#FFFFFF` |
| Foreground muted | `#6B7280` | `#9CA3AF` |
| Border | `#E5E7EB` | `#1F2937` |
| Danger | `#DC2626` | `#F87171` |

Button conventions from the web app: primary = yellow background, black text.
Secondary = black background, white text. Danger = black background, red text.

**The web app forbids transitions and animations** (loading spinners excepted).
That restraint was deliberate. A native app reasonably wants gesture feedback
and transitions — but treat relaxing it as a decision to argue for, not a
default to drift into. If you introduce motion, say where and why.

---

## Technical constraints worth designing around

The stack is fixed and documented in `mobile-app/docs/STACK_BASIS.md`: Expo SDK
54, expo-router (file-based), NativeWind + Tailwind, TanStack Query with
persistence, lucide-react-native icons.

- **Design in Tailwind-expressible terms.** NativeWind means the palette above
  maps to utility classes; layouts that need arbitrary values are a smell.
- **Icons come from lucide.** Do not specify a custom icon set.
- **Touch targets:** these are used with dirty or gloved hands beside a
  vehicle. Be generous — 44pt minimum, larger for the primary counter actions.
- **Currency is PHP (₱)**, formatted `en-PH`. Amounts are frequently 4–6
  digits; leave room.
- **Phone numbers are Philippine mobile format** — 10 digits starting with 9,
  displayed with a `+63` prefix.
- **Product images** are served from the API host and may be missing; every
  product surface needs a placeholder state.
- **Dark mode is already wired** (`contexts/theme-context.tsx`). Design both.

---

## What not to design

From the verified gap audit — these do not exist in the backend, and designing
them would produce screens nothing can fill:

- Financial reports or a transactions ledger. `Transaction` records are written
  on order completion but **no endpoint reads them back**.
- Customer-facing order history or service tracking.
- Push notifications, realtime updates, or any live-updating view.
- Refunds, expenses, or transfer transactions as distinct financial types.
- Analytics beyond a single sales-statistics endpoint.

If a screen feels like it needs one of these, flag it as an API gap rather than
designing around a fiction.
