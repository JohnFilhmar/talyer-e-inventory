import "../global.css";

import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { palette } from "@/constants/colors";
import { ThemeProvider, useTheme } from "@/contexts/theme-context";
import { navDarkTheme, navLightTheme } from "@/lib/nav-theme";
import { persistOptions, queryClient } from "@/lib/query-client";

void SplashScreen.preventAutoHideAsync();

/** Rendered inside ThemeProvider, so it only mounts once the theme is resolved. */
function RootNavigator() {
  const { scheme } = useTheme();
  const isDark = scheme === "dark";

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <NavigationThemeProvider value={isDark ? navDarkTheme : navLightTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: isDark ? palette["bg-dark"] : palette.bg },
        }}
      />
      <StatusBar style="auto" />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <KeyboardProvider>
          <ThemeProvider>
            <SafeAreaProvider>
              {/* Feature providers (auth, branch, …) mount here, inside the theme. */}
              <RootNavigator />
            </SafeAreaProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
