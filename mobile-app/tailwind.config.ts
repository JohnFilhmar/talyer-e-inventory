import type { Config } from "tailwindcss";
import fs from "fs";
import { palette } from "./constants/colors";

// Absolute real-path globs: relative globs through a junction silently produce
// empty CSS and strip every NativeWind style from the release build.
const root = fs.realpathSync(__dirname).replace(/\\/g, "/");

export default {
  content: [`${root}/app/**/*.{js,jsx,ts,tsx}`, `${root}/components/**/*.{js,jsx,ts,tsx}`],
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- tailwind presets are CJS
  presets: [require("nativewind/preset")],
  // `class` (not `media`) so the persisted auto/light/dark preference in
  // contexts/theme-context.tsx actually drives the `dark:` variant.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: palette.bg, dark: palette["bg-dark"] },
        surface: { DEFAULT: palette.surface, dark: palette["surface-dark"] },
        fg: {
          DEFAULT: palette.fg,
          "2": palette["fg-2"],
          dark: palette["fg-dark"],
          "2-dark": palette["fg-2-dark"],
        },
        border: { DEFAULT: palette.border, dark: palette["border-dark"] },
        brand: {
          DEFAULT: palette.brand,
          soft: palette["brand-soft"],
          dark: palette["brand-dark"],
        },
        danger: { DEFAULT: palette.danger, dark: palette["danger-dark"] },
      },
    },
  },
  plugins: [],
} satisfies Config;
