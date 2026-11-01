import { useSyncExternalStore } from "react";
import { useColorScheme } from "react-native";

const subscribe = () => () => {};

/**
 * The colour scheme to render with.
 *
 * The static web export is pre-rendered without knowing the viewer's scheme,
 * so its HTML is light. React does not repair mismatched style attributes
 * while hydrating, which left a dark-mode viewer with a light header and page
 * behind light text. During hydration this hook therefore reports "light" to
 * match the HTML, then re-renders with the real scheme as an ordinary update.
 * On native there is no hydration and it returns the real scheme at once.
 */
export function useAppColorScheme(): "light" | "dark" {
  const scheme = useColorScheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return hydrated && scheme === "dark" ? "dark" : "light";
}
