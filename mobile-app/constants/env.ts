/**
 * The only place environment is read. Everything comes from EXPO_PUBLIC_* with a
 * `?? default`; boolean flags are parsed from the "true"/"false" strings Expo inlines.
 *
 * API_URL must carry the `/api` suffix — the backend mounts every router under
 * `/api/*` while the service layer requests unprefixed paths (`/auth/login`).
 */
export const ENV = {
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5000/api",
  APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT ?? "production",
  ENABLE_REALTIME: process.env.EXPO_PUBLIC_ENABLE_REALTIME === "true",
} as const;
