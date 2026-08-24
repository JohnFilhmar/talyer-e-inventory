/**
 * Single source of design tokens. Every token has a `-dark` sibling;
 * `tailwind.config.ts` maps this map into color scales, so a screen reads
 * `bg-bg dark:bg-bg-dark`, `text-fg-2 dark:text-fg-2-dark`, `bg-brand`.
 *
 * Palette mirrors the web app: yellow-400 brand, black/white, gray chrome.
 */
export const palette = {
  bg: "#FFFFFF",
  "bg-dark": "#000000",

  surface: "#F3F4F6",
  "surface-dark": "#111827",

  fg: "#000000",
  "fg-2": "#6B7280",
  "fg-dark": "#FFFFFF",
  "fg-2-dark": "#9CA3AF",

  border: "#E5E7EB",
  "border-dark": "#1F2937",

  brand: "#FBBF24",
  "brand-soft": "#FEF3C7",
  "brand-dark": "#F59E0B",

  danger: "#DC2626",
  "danger-dark": "#F87171",
} as const;

export type PaletteToken = keyof typeof palette;
