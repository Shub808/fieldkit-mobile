import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppProvider } from "@/state/app-context";
import { darkTheme, lightTheme } from "@/theme";
import { useAppColorScheme } from "@/theme/use-app-color-scheme";

const MARK_ID = "authorship-mark";
const MARK_CSS =
  'body::after{content:"\\00a9  2026 Shubham Naik \\00b7  Portfolio project";position:fixed;right:10px;top:6px;z-index:50;font:500 11px/1 ui-monospace,Menlo,monospace;opacity:.5;pointer-events:none;user-select:none}';

/** Web build only: a small, non-interactive authorship mark in the corner. */
function useAuthorshipMark() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (document.getElementById(MARK_ID)) return;
    const style = document.createElement("style");
    style.id = MARK_ID;
    style.textContent = MARK_CSS;
    document.head.appendChild(style);
  }, []);
}

export default function RootLayout() {
  useAuthorshipMark();
  const scheme = useAppColorScheme();
  const theme = scheme === "dark" ? darkTheme : lightTheme;

  // Give the navigation container the same palette as the screens. Without
  // this its default light theme paints the header, tab bar and scene
  // background, which leaves light text on a light page in dark mode (seen on
  // the web build).
  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.accent,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style={theme.dark ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.colors.surface },
              headerTintColor: theme.colors.text,
              headerTitleStyle: { fontWeight: "600" },
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="job/[id]"
              options={{ title: "Job", headerBackTitle: "Work" }}
            />
          </Stack>
        </AppProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
