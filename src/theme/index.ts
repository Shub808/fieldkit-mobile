import { useColorScheme } from "react-native";

import { darkTheme, lightTheme, type Theme } from "@/theme/tokens";

/** The palette for the device's current appearance setting. */
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? darkTheme : lightTheme;
}

export * from "@/theme/tokens";
