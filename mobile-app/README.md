# Talyer-E Mobile

Expo (managed / CNG) shell for the Talyer-E inventory app, wired to
[docs/STACK_BASIS.md](docs/STACK_BASIS.md). **No product features yet** — this is the
boot skeleton: routing, styling, providers, config.

```bash
npm start              # expo dev server
npm run android        # dev build on a device/emulator
npm run web            # web target
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (flat config)
npm test               # jest (jest-expo preset, no suites yet)
npm run prebuild       # expo prebuild --clean — regenerates android/ ios/
```

`android/` and `ios/` are **not** committed (CNG). Regenerate locally with
`npm run prebuild`; EAS regenerates them in the cloud.

## What is wired

| Layer | Where |
|---|---|
| Routing | [app/_layout.tsx](app/_layout.tsx) (provider tree + `Stack`), [app/index.tsx](app/index.tsx) |
| Design tokens | [constants/colors.ts](constants/colors.ts) → [tailwind.config.ts](tailwind.config.ts) |
| Theme (auto/light/dark, persisted) | [contexts/theme-context.tsx](contexts/theme-context.tsx), [lib/nav-theme.ts](lib/nav-theme.ts) |
| Server state | [lib/query-client.ts](lib/query-client.ts) (+ AsyncStorage persister) |
| Config | [constants/env.ts](constants/env.ts), [.env.example](.env.example), [app.config.js](app.config.js), [eas.json](eas.json) |
| Bundler | [metro.config.js](metro.config.js), [babel.config.js](babel.config.js) |

New Architecture and React Compiler are on (`app.json` → `experiments`), typed routes
enabled, TypeScript `strict`, path alias `@/*` → project root.

## Conventions

Directory layout and layering follow §14 of the stack basis:

```
app/         expo-router routes ONLY
components/  presentational, grouped by feature + ui/ primitives
hooks/       queries/  mutations/  + feature hooks
services/    api client + one module per API domain
lib/         framework-agnostic logic (query-client, nav-theme, …)
contexts/    React Context providers
constants/   colors (palette), env, query-keys
types/       one domain per file
utils/       pure helpers
```

`component → query/mutation hook → service fn → api client`. UI never imports axios.

## Env

Copy [.env.example](.env.example) to `.env.local`. `EXPO_PUBLIC_API_URL` **must carry the
`/api` suffix** — the backend mounts every router under `/api/*` while services request
unprefixed paths. Expo inlines `EXPO_PUBLIC_*` at bundle time, so a change needs
`npx expo start -c`.

Android emulator reaches a host backend at `http://10.0.2.2:5000/api`; a physical device
needs the machine's LAN IP.

## Not yet built

Everything in §7–§12 and §17 of the stack basis: `services/api.ts` (axios client +
interceptors), `lib/token-refresh.ts`, secure-storage, device headers, auth flow and the
`(auth)`/`(tabs)` route groups, realtime, push. `constants/query-keys.ts` and
`lib/query-client.ts`'s `resetSessionCaches()` are stubs waiting on those.

The React Query persister currently whitelists nothing
(`shouldDehydrateQuery: () => false`) — opt query families in deliberately, and encrypt
the blob at rest before persisting anything private.
