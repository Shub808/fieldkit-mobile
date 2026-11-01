import { useAppColorScheme } from "@/theme/use-app-color-scheme";
import { darkTheme, lightTheme, type Theme } from "@/theme/tokens";

/** The palette for the device's current appearance setting. */
export function useTheme(): Theme {
  return useAppColorScheme() === "dark" ? darkTheme : lightTheme;
}

export * from "@/theme/tokens";
