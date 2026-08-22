import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme, useColorScheme } from "nativewind";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemePreference = "auto" | "light" | "dark";

const STORAGE_KEY = "talyer-e-theme";

type ThemeValue = {
  /** What the user picked. Default "auto" = follow the system. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => Promise<void>;
  /** What "auto" actually resolved to — drives the navigation theme. */
  scheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeValue | null>(null);

function isPreference(value: string | null): value is ThemePreference {
  return value === "auto" || value === "light" || value === "dark";
}

function apply(preference: ThemePreference) {
  colorScheme.set(preference === "auto" ? "system" : preference);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme: scheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("auto");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (isPreference(stored)) {
          apply(stored);
          setPreferenceState(stored);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    apply(next);
    setPreferenceState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  // Gate the tree on the stored preference so the first paint is not the wrong theme.
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ preference, setPreference, scheme: scheme ?? "light" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
