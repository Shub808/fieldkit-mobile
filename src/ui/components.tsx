import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { radius, spacing, useTheme, type Theme } from "@/theme";

/**
 * Shared primitives.
 *
 * Every interactive element here sets an accessibility role and, where the
 * visible label is not enough on its own, an accessibility label — on a
 * phone, a `Pressable` with no role is invisible to VoiceOver and TalkBack.
 * Hit targets are at least 44×44, which is the smallest reliable touch target
 * for someone wearing gloves in the rain.
 */

export const MIN_TOUCH_TARGET = 44;

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}>
      {children}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export type TextTone = "default" | "muted" | "subtle" | "accent";
export type TextVariant = "display" | "title" | "body" | "label" | "caption";

const VARIANTS: Record<TextVariant, TextStyle> = {
  display: { fontSize: 22, fontWeight: "700", lineHeight: 28 },
  title: { fontSize: 17, fontWeight: "600", lineHeight: 23 },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "500", lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 17 },
};

function toneColor(theme: Theme, tone: TextTone): string {
  switch (tone) {
    case "muted":
      return theme.colors.textMuted;
    case "subtle":
      return theme.colors.textSubtle;
    case "accent":
      return theme.colors.accentOnTint;
    default:
      return theme.colors.text;
  }
}

export function Label({
  children,
  variant = "body",
  tone = "default",
  style,
  numberOfLines,
  ...rest
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityRole?: "header" | "text";
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[VARIANTS[variant], { color: toneColor(theme, tone) }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "secondary",
  disabled = false,
  loading = false,
  accessibilityHint,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: {
      bg: theme.colors.accent,
      fg: theme.colors.accentText,
      border: theme.colors.accent,
    },
    secondary: {
      bg: theme.colors.surface,
      fg: theme.colors.text,
      border: theme.colors.borderStrong,
    },
    ghost: { bg: "transparent", fg: theme.colors.textMuted, border: "transparent" },
    danger: {
      bg: theme.colors.badBg,
      fg: theme.colors.badText,
      border: theme.colors.badBorder,
    },
  };
  const colors = palette[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: spacing.sm,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.fg} /> : null}
      <Text style={{ color: colors.fg, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export type ChipTone = "good" | "warn" | "bad" | "info" | "neutral" | "accent";

export function Chip({
  label,
  tone = "neutral",
  glyph,
  style,
}: {
  label: string;
  tone?: ChipTone;
  /** Shown alongside the colour so state never depends on hue alone. */
  glyph?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const palette: Record<ChipTone, { bg: string; fg: string; border: string }> = {
    good: { bg: theme.colors.goodBg, fg: theme.colors.goodText, border: theme.colors.goodBorder },
    warn: { bg: theme.colors.warnBg, fg: theme.colors.warnText, border: theme.colors.warnBorder },
    bad: { bg: theme.colors.badBg, fg: theme.colors.badText, border: theme.colors.badBorder },
    info: { bg: theme.colors.infoBg, fg: theme.colors.infoText, border: theme.colors.infoBorder },
    neutral: {
      bg: theme.colors.neutralBg,
      fg: theme.colors.neutralText,
      border: theme.colors.neutralBorder,
    },
    accent: {
      bg: theme.colors.accentTint,
      fg: theme.colors.accentOnTint,
      border: theme.colors.accentTint,
    },
  };
  const colors = palette[tone];

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          alignSelf: "flex-start",
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
          borderRadius: radius.pill,
          borderWidth: StyleSheet.hairlineWidth,
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {glyph ? (
        <Text accessibilityElementsHidden style={{ color: colors.fg, fontSize: 11 }}>
          {glyph}
        </Text>
      ) : null}
      <Text style={{ color: colors.fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Row({
  children,
  gap = spacing.sm,
  wrap = false,
  style,
}: {
  children: ReactNode;
  gap?: number;
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap, flexWrap: wrap ? "wrap" : "nowrap" },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }}
    />
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ padding: spacing.xxl, alignItems: "center", gap: spacing.sm }}>
      <Label variant="title">{title}</Label>
      {body ? (
        <Label variant="caption" tone="muted" style={{ textAlign: "center" }}>
          {body}
        </Label>
      ) : null}
    </View>
  );
}

export function Banner({
  tone,
  title,
  body,
  action,
}: {
  tone: ChipTone;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  const colors = {
    good: [theme.colors.goodBg, theme.colors.goodText, theme.colors.goodBorder],
    warn: [theme.colors.warnBg, theme.colors.warnText, theme.colors.warnBorder],
    bad: [theme.colors.badBg, theme.colors.badText, theme.colors.badBorder],
    info: [theme.colors.infoBg, theme.colors.infoText, theme.colors.infoBorder],
    neutral: [
      theme.colors.neutralBg,
      theme.colors.neutralText,
      theme.colors.neutralBorder,
    ],
    accent: [theme.colors.accentTint, theme.colors.accentOnTint, theme.colors.accentTint],
  }[tone];

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={body ? `${title}. ${body}` : title}
      style={{
        backgroundColor: colors[0],
        borderColor: colors[2],
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <Text style={{ color: colors[1], fontSize: 14, fontWeight: "600" }}>{title}</Text>
      {body ? (
        <Text style={{ color: colors[1], fontSize: 13, lineHeight: 18 }}>{body}</Text>
      ) : null}
      {action}
    </View>
  );
}
