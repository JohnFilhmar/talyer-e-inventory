import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";
import { palette } from "@/constants/colors";

/**
 * The navigation container theme is overridden (and the Stack's
 * contentStyle.backgroundColor set to match) so a screen pop never flashes white.
 */
export const navLightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.bg,
    card: palette.bg,
    text: palette.fg,
    border: palette.border,
    primary: palette.brand,
    notification: palette.danger,
  },
};

export const navDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: palette["bg-dark"],
    card: palette["bg-dark"],
    text: palette["fg-dark"],
    border: palette["border-dark"],
    primary: palette["brand-dark"],
    notification: palette["danger-dark"],
  },
};
