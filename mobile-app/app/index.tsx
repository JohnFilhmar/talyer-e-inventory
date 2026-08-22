import { Wrench } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { palette } from "@/constants/colors";
import { ENV } from "@/constants/env";
import { useTheme, type ThemePreference } from "@/contexts/theme-context";

const PREFERENCES: ThemePreference[] = ["auto", "light", "dark"];

const WIRED = [
  "expo-router (typed routes)",
  "NativeWind + Tailwind tokens",
  "React Query + AsyncStorage persist",
  "Reanimated / SVG / keyboard-controller",
  "expo-secure-store, expo-image",
];

export default function Home() {
  const { preference, setPreference } = useTheme();
  // The brand tile is yellow in both themes, so the glyph stays black.
  const iconColor = palette.fg;

  return (
    <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark">
      <ScrollView contentContainerClassName="gap-6 p-6">
        <View className="gap-2">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-brand dark:bg-brand-dark">
            <Wrench size={24} color={iconColor} />
          </View>
          <Text className="text-3xl font-bold text-fg dark:text-fg-dark">Talyer-E</Text>
          <Text className="text-base text-fg-2 dark:text-fg-2-dark">
            Mobile shell is up. No features wired yet.
          </Text>
        </View>

        <View className="gap-3 rounded-xl border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark">
          <Text className="text-sm font-semibold uppercase text-fg-2 dark:text-fg-2-dark">
            Stack in place
          </Text>
          {WIRED.map((item) => (
            <Text key={item} className="text-base text-fg dark:text-fg-dark">
              • {item}
            </Text>
          ))}
        </View>

        <View className="gap-3">
          <Text className="text-sm font-semibold uppercase text-fg-2 dark:text-fg-2-dark">
            Theme
          </Text>
          <View className="flex-row gap-2">
            {PREFERENCES.map((option) => {
              const active = option === preference;
              return (
                <Pressable
                  key={option}
                  onPress={() => void setPreference(option)}
                  className={
                    active
                      ? "flex-1 rounded-lg bg-brand px-4 py-3 dark:bg-brand-dark"
                      : "flex-1 rounded-lg border border-border px-4 py-3 dark:border-border-dark"
                  }
                >
                  <Text
                    className={
                      active
                        ? "text-center text-base font-semibold text-fg"
                        : "text-center text-base text-fg dark:text-fg-dark"
                    }
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text className="text-xs text-fg-2 dark:text-fg-2-dark">API base: {ENV.API_URL}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
