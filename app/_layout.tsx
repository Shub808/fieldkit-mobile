import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppProvider } from "@/state/app-context";
import { darkTheme, lightTheme } from "@/theme";

const MARK_ID = "authorship-mark";
const MARK_CSS =
  'body::after{content:"\\00a9  2026 Shubham Naik \\00b7  Portfolio project";position:fixed;right:10px;bottom:6px;z-index:50;font:500 11px/1 ui-monospace,Menlo,monospace;opacity:.5;pointer-events:none;user-select:none}';

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
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? darkTheme : lightTheme;

  return (
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
  );
}
