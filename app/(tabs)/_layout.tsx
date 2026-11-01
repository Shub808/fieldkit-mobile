import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

import { useApp } from "@/state/app-context";
import { useTheme } from "@/theme";

/**
 * The tab bar carries the only always-visible piece of sync state: a badge on
 * Sync when there is unsent work. A technician should never have to go
 * looking to find out whether their day has reached the office.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { sync } = useApp();
  const outstanding = sync.pending + sync.deadLettered + sync.conflicts;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Work",
          tabBarIcon: ({ color }) => <TabGlyph glyph="▤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="sync"
        options={{
          title: "Sync",
          tabBarBadge: outstanding > 0 ? outstanding : undefined,
          tabBarIcon: ({ color }) => <TabGlyph glyph="⇅" color={color} />,
        }}
      />
      <Tabs.Screen
        name="conditions"
        options={{
          title: "Conditions",
          tabBarIcon: ({ color }) => <TabGlyph glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabGlyph({ glyph, color }: { glyph: string; color: ColorValue }) {
  // The tab's own label names it, so the glyph is decoration.
  return (
    <Text accessibilityElementsHidden style={{ color, fontSize: 20 }}>
      {glyph}
    </Text>
  );
}
