# Frontend System Guidelines — Talyer E-Inventory MVP

**Version:** 1.0  
**Target:** MVP System (Not Production-Ready, Security-Conscious)  
**Last Updated:** January 31, 2026

---

## System Philosophy

This is an **MVP (Minimum Viable Product)** system designed to validate business functionality and demonstrate core features. While not production-ready, it **must** implement proper security measures, authentication, authorization, and input validation from day one. The system should be clean, maintainable, and extensible for future production hardening.

---

## Design System

### Color Palette (Strict)
**Only use these colors throughout the entire application:**

- **Primary (Yellow):** `#FBBF24` (yellow-400) for primary actions, highlights, active states
- **Secondary (Black):** `#000000` for text, borders, backgrounds
- **Tertiary (White):** `#FFFFFF` for backgrounds, text on dark surfaces
- **Grays (Allowed for UI elements):** `#F3F4F6` (gray-100), `#E5E7EB` (gray-200), `#9CA3AF` (gray-400), `#6B7280` (gray-500) for subtle borders, disabled states, secondary text

**Usage Rules:**
- **Buttons (Primary):** Yellow background, black text
- **Buttons (Secondary):** Black background, white text
- **Buttons (Danger):** Black background with red text/border
- **Backgrounds:** White for content areas, gray-100 for page backgrounds, black for headers/footers
- **Text:** Black on light backgrounds, white on dark backgrounds
- **Borders:** Gray-200 for subtle dividers, black for emphasis
- **Active/Focus States:** Yellow highlights, yellow underlines, yellow borders
- **Status Indicators:** Use yellow/black/white with text labels instead of multiple colors

### Typography
- **Font Family:** Inter, system-ui, sans-serif (default Next.js)
- **Headings:** Bold, black color, appropriate sizing (text-2xl, text-xl, text-lg)
- **Body Text:** Regular weight, black color, text-base (16px)
- **Labels:** Medium weight, text-sm, gray-700
- **Helper Text:** Regular weight, text-xs, gray-500

### Spacing & Layout
- **Container Max Width:** `max-w-7xl` (1280px) for main content
- **Padding:** Consistent padding using Tailwind's spacing scale (p-4, p-6, p-8)
- **Gaps:** Use `gap-4`, `gap-6` for flex/grid layouts
- **Section Spacing:** `mb-6`, `mb-8` between major sections

### Responsive Design (Required)
**All pages and components must be fully responsive:**
- **Mobile-First:** Design for mobile (320px+), then tablet (768px+), then desktop (1024px+)
- **Breakpoints:** Use Tailwind's standard breakpoints: `sm:`, `md:`, `lg:`, `xl:`, `2xl:`
- **Navigation:** Hamburger menu on mobile, full navigation on desktop
- **Tables:** Horizontal scroll or card layout on mobile, full table on desktop
- **Forms:** Stack inputs on mobile, side-by-side on desktop where appropriate
- **Modals/Dialogs:** Full-screen on mobile, centered overlay on desktop

---

## UI Components & Patterns

### No Animations (MVP Constraint)
- **No transitions, animations, or motion effects** to keep the MVP lightweight
- Use instant state changes (no fade-ins, slide-ins, etc.)
- Exception: Loading spinners are allowed (simple, static spinner icons)

### Standard Components
Create reusable components in `src/components/`:

1. **Buttons**
   - `<Button variant="primary|secondary|danger" size="sm|md|lg" />`
   - Primary: yellow bg, black text
   - Secondary: black bg, white text
   - Danger: black bg with red text

2. **Forms**
   - `<Input />`, `<TextArea />`, `<Select />`, `<Checkbox />`, `<Radio />`
   - Consistent border styles (gray-200), focus states (yellow border)
   - Error states: red text below input, red border

3. **Tables**
   - `<Table />`, `<TableHeader />`, `<TableRow />`, `<TableCell />`
   - Responsive: horizontal scroll on mobile, full table on desktop
   - Pagination controls at bottom

4. **Cards**
   - `<Card />` for content grouping
   - White background, gray-200 border, shadow-sm

5. **Modals/Dialogs**
   - `<Modal />` for confirmations, forms, details
   - Full-screen on mobile, centered on desktop
   - Overlay: black with opacity

6. **Navigation**
   - Top navbar with logo, navigation links, user menu
   - Sidebar for main sections (optional on desktop)
   - Mobile: hamburger menu

7. **Feedback**
   - `<Alert type="success|error|warning|info" />` for messages
   - Toast notifications for quick feedback (appear at top-right)
   - Loading states: spinner icon with "Loading..." text

8. **Status Badges**
   - `<Badge />` for order statuses, stock levels
   - Use yellow/black/white with clear text labels
   - Example: "Pending" (yellow bg, black text), "Completed" (black bg, white text)

---

## Security & Validation

### Input Validation (Critical)
**Every user input must be validated on the frontend before submission:**

1. **Client-Side Validation:**
   - Required fields: Check for non-empty values
   - Email format: Use regex or validation library
   - Phone numbers: Format validation (e.g., 10 digits)
   - Numbers: Min/max ranges, positive values for prices/quantities
   - Dates: Valid date formats, future dates where required
   - Text lengths: Min/max character limits
   - **Use Zod or Yup** for schema-based validation

2. **Sanitization:**
   - Trim whitespace from text inputs
   - Normalize email to lowercase
   - Strip HTML tags from user input (prevent XSS)
   - Encode special characters when displaying user-generated content

3. **Error Display:**
   - Show field-level errors below inputs (red text)
   - Disable submit button until form is valid
   - Clear, actionable error messages

### Authentication & Authorization (Required)

#### Authentication Flow
1. **Login:**
   - User submits email/password
   - Frontend sends to `/auth/login`
   - Backend returns `{ accessToken, refreshToken, user }`
   - Store `accessToken` in memory (React state/context)
   - Store `refreshToken` in httpOnly cookie (backend sets) or localStorage as fallback
   - Redirect to dashboard

2. **Token Storage:**
   - **Access Token:** Memory (React context/Zustand) — never localStorage for security
   - **Refresh Token:** httpOnly cookie (preferred) or localStorage (fallback)
   - On page reload: Check for refresh token, fetch new access token if available

3. **Token Refresh:**
   - Axios interceptor catches 401 responses
   - Automatically calls `/auth/refresh-token` with refresh token
   - Retry failed request with new access token
   - If refresh fails: clear tokens, redirect to login

4. **Logout:**
   - Call `/auth/logout` to invalidate refresh token
   - Clear all tokens from memory and storage
   - Redirect to login page

#### Authorization Middleware
**Implement route guards to enforce role-based access:**

1. **Route Protection (`authGuard.ts`):**
   - Check if user is authenticated (has access token)
   - If not: redirect to `/login`
   - If yes: allow access to protected routes

2. **Role Guards (`roleGuard.ts`):**
   - **Admin-only routes:** `/branches/new`, `/categories/new`, `/products/new`, `/suppliers/new`, `/stock/adjust`
   - **Salesperson routes:** Own branch sales/stock only
   - **Mechanic routes:** Assigned service jobs only (`/services/my-jobs`)
   - Implement as higher-order components or middleware hooks

3. **Component-Level Authorization:**
   - Hide/disable UI elements based on user role
   - Example: Hide "Delete" button for non-admins
   - Use `useAuth()` hook to get current user and role

4. **Branch Scoping:**
   - Non-admin users limited to their assigned branch
   - Filter queries by branch: `?branch=${user.branch}`
   - Display branch selector only for admins

### API Client Security

**Configure `lib/apiClient.ts` with security best practices:**

1. **Axios Interceptors:**
   - **Request:** Attach `Authorization: Bearer <accessToken>` to all requests
   - **Response:** Handle 401 (refresh token), 403 (forbidden), 500 (server error)

2. **CSRF Protection:**
   - If backend uses CSRF tokens, include them in headers

3. **HTTPS Only:**
   - Use `https://` URLs in production
   - Never send tokens over HTTP

4. **Timeout:**
   - Set request timeout (10-30 seconds) to prevent hanging

5. **Error Handling:**
   - Parse backend error responses (`ApiResponse.message`, `ApiResponse.errors`)
   - Display user-friendly messages
   - Log errors for debugging (without sensitive data)

---

## State Management & Data Fetching

### Recommended Stack
- **Global State:** Zustand (lightweight, simple) or React Context for auth state
- **Server State:** SWR or React Query for data fetching, caching, revalidation
- **Form State:** React Hook Form with Zod validation

### Data Fetching Patterns
1. **List Views (GET):**
   - Use SWR/React Query with pagination
   - Cache for 30-60 seconds, revalidate on focus
   - Show loading spinner while fetching

2. **Detail Views (GET):**
   - Fetch on component mount
   - Cache for 5 minutes
   - Revalidate on window focus

3. **Mutations (POST/PUT/DELETE):**
   - Use SWR's `mutate` or React Query's `useMutation`
   - Optimistic updates for instant feedback
   - Revalidate/refetch related queries on success
   - Show error toast on failure

4. **Real-Time Updates (Future):**
   - Placeholder for WebSocket/Socket.io integration (Phase 9+)

---

## File Structure & Module Organization

### Folder Conventions
```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/
│   │   └── login/           # Public routes
│   └── (protected)/
│       ├── layout.tsx       # Protected layout with auth guard
│       ├── dashboard/
│       ├── branches/
│       ├── products/
│       ├── stock/
│       ├── suppliers/
│       ├── sales/
│       └── services/
├── components/              # Reusable UI components
│   ├── ui/                 # Base components (Button, Input, etc.)
│   ├── forms/              # Form components
│   ├── tables/             # Table components
│   └── layout/             # Layout components (Navbar, Sidebar)
├── features/               # Domain modules
│   ├── auth/
│   │   ├── services/       # authService.ts
│   │   ├── hooks/          # useAuth.ts
│   │   ├── types/          # Auth types
│   │   └── components/     # Login form, etc.
│   ├── branches/
│   ├── products/
│   ├── stock/
│   ├── suppliers/
│   ├── sales/
│   └── services/
├── lib/                    # Shared utilities
│   ├── apiClient.ts       # Axios instance with interceptors
│   ├── config.ts          # Environment variables
│   └── response.ts        # ApiResponse helpers
├── middleware/             # Client-side guards
│   ├── authGuard.ts
│   └── roleGuard.ts
├── types/                  # Global TypeScript types
│   ├── api.ts             # ApiResponse, PaginatedResponse
│   └── models/            # User, Branch, Product, etc.
├── hooks/                  # Shared hooks
│   ├── useAuth.ts
│   ├── useApi.ts
│   └── useBranchContext.ts
└── utils/                  # Helper functions
    ├── formatters.ts      # Date, currency formatters
    ├── validators.ts      # Validation helpers
    └── constants.ts       # App constants
```

### Module Boundaries
- **No cross-feature imports:** `features/auth/` should not import from `features/products/`
- **Shared code goes in:** `lib/`, `hooks/`, `utils/`, `types/`
- **Components:** Use `components/ui/` for generic UI, `features/*/components/` for domain-specific

---

## TypeScript & Type Safety

### Strict Mode (Required)
Enable strict TypeScript settings in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Type Definitions
1. **Mirror Backend Models:**
   - Create TypeScript interfaces in `types/models/` matching backend Mongoose schemas
   - Example: `types/models/Product.ts`, `types/models/SalesOrder.ts`

2. **API Types:**
   - Define request/response types for all endpoints
   - Use generics: `ApiResponse<T>`, `PaginatedResponse<T>`

3. **Form Types:**
   - Create Zod schemas for forms, infer TypeScript types
   - Example: `const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6) })`

4. **Avoid `any`:**
   - Use `unknown` if type is uncertain, then narrow with type guards
   - Use `Record<string, unknown>` for dynamic objects

---

## Performance & Optimization

### Code Splitting
- Use dynamic imports for large components/pages
- Example: `const HeavyComponent = dynamic(() => import('./HeavyComponent'))`

### Image Optimization
- Use Next.js `<Image />` component for product images
- Define image sizes, use lazy loading

### Pagination & Infinite Scroll
- Default page size: 20 items
- Implement pagination for tables (limit/offset)
- Consider infinite scroll for mobile product lists (future)

### Caching Strategy
- **Static Pages:** Cache at CDN level (future production)
- **API Responses:** SWR/React Query cache with stale-while-revalidate
- **Images:** Cache product images with long TTL

---

## Error Handling & Logging

### Error Boundaries
- Wrap app with React Error Boundary
- Display friendly error page on crashes
- Log errors to console (no external logging in MVP)

### API Error Handling
1. **Network Errors:** Show "Connection failed" message
2. **400 Errors:** Display validation errors per field
3. **401 Errors:** Refresh token, retry, or redirect to login
4. **403 Errors:** Show "Access denied" message
5. **404 Errors:** Show "Resource not found" page
6. **500 Errors:** Show "Server error, please try again" message

### User Feedback
- **Success:** Toast notification (green text on white bg with yellow accent)
- **Error:** Toast notification (red text on white bg with black border)
- **Loading:** Spinner with "Loading..." text
- **Empty States:** Clear message with action button (e.g., "No products found. Add one?")

---

## Testing Strategy (MVP Scope)

### Manual Testing (Primary for MVP)
- Test all user flows manually on desktop and mobile
- Verify role-based access controls
- Test form validations
- Check responsive design on multiple screen sizes

### Automated Testing (Optional for MVP, Recommended for Future)
- **Unit Tests:** Jest + React Testing Library for components
- **Integration Tests:** Test API service functions with mocked responses
- **E2E Tests:** Playwright or Cypress (future production phase)

---

## Environment Configuration

### Environment Variables
Create `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_APP_NAME=Talyer E-Inventory
```

**Rules:**
- Prefix public variables with `NEXT_PUBLIC_`
- Never commit `.env.local` to version control
- Document all variables in README

---

## Accessibility (Basic MVP Compliance)

### Minimum Requirements
- **Keyboard Navigation:** All interactive elements accessible via Tab
- **Focus States:** Visible focus indicators (yellow outline)
- **Alt Text:** All images have descriptive alt text
- **Labels:** All form inputs have associated `<label>` elements
- **ARIA Labels:** Use `aria-label` for icon-only buttons
- **Color Contrast:** Ensure text meets WCAG AA standards (black on white, white on black)

---

## Documentation Requirements

### Code Documentation
- **JSDoc comments** for complex functions
- **README** in each feature folder explaining its purpose
- **Inline comments** for non-obvious business logic

### User Documentation (Future)
- User guide for each role (admin, salesperson, mechanic)
- Placeholder for help tooltips in UI

---

## Phase Implementation Order

Follow the structured phase documents:
1. **Phase 1:** Auth & User Management — Foundation
2. **Phase 2:** Branch Management — Organizational structure
3. **Phase 3:** Category & Product Management — Inventory foundation
4. **Phase 4:** Stock & Supplier Management — Inventory operations
5. **Phase 5:** Sales Order Management — Primary revenue
6. **Phase 6:** Service Order Management — Secondary revenue

Each phase document specifies:
- UI/Pages to build first
- Feature implementation steps
- Validation & security checklist
- Success criteria

---

## Common Pitfalls to Avoid

1. **Over-engineering:** Keep it simple for MVP; avoid premature optimization
2. **Skipping validation:** Always validate input on frontend AND backend
3. **Ignoring mobile:** Test on mobile devices early and often
4. **Hardcoding values:** Use constants and environment variables
5. **Poor error messages:** Be specific and actionable (not "Error occurred")
6. **Mixing concerns:** Keep components, services, and hooks separate
7. **Token in localStorage:** Prefer memory + httpOnly cookies for security
8. **No loading states:** Always show feedback during async operations
9. **Inconsistent styling:** Stick to yellow/black/white palette strictly
10. **Breaking responsive design:** Test every page on mobile before moving on

---

## Ready for Production Checklist (Future)

When transitioning from MVP to production, address:
- [ ] Add comprehensive E2E test suite
- [ ] Implement proper logging and monitoring
- [ ] Add rate limiting on API calls
- [ ] Optimize bundle size and performance
- [ ] Add animations and polish (post-MVP)
- [ ] Implement advanced caching strategies
- [ ] Add comprehensive error tracking (Sentry, etc.)
- [ ] Security audit and penetration testing
- [ ] Accessibility audit (WCAG AA compliance)
- [ ] Load testing and performance optimization
- [ ] Add WebSocket real-time features (Phase 9)
- [ ] Implement comprehensive backup strategy
- [ ] Add multi-language support (if needed)
- [ ] Create user onboarding flows
- [ ] Write production deployment documentation

---

**End of Guidelines**

Refer to individual Phase documents (Frontend-Phase-1.md through Frontend-Phase-6.md) for detailed implementation plans aligned with backend features.
