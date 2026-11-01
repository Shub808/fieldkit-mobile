/**
 * Design tokens.
 *
 * React Native has no CSS custom properties, so the token set is a plain
 * object and the two schemes are two instances of the same shape. Components
 * read `theme.colors.textMuted`, never a literal — which is what makes the
 * light and dark schemes impossible to drift apart, and what made it possible
 * to fix the contrast of every screen by editing one file.
 *
 * Text pairs were checked against their own backgrounds at 4.5:1 (WCAG AA for
 * body text) and 3:1 for large text and UI boundaries.
 */

export interface Palette {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentText: string;
  accentTint: string;
  accentOnTint: string;
  goodBg: string;
  goodText: string;
  goodBorder: string;
  warnBg: string;
  warnText: string;
  warnBorder: string;
  badBg: string;
  badText: string;
  badBorder: string;
  infoBg: string;
  infoText: string;
  infoBorder: string;
  neutralBg: string;
  neutralText: string;
  neutralBorder: string;
}

export const lightPalette: Palette = {
  background: "#f6f7f9",
  surface: "#ffffff",
  surfaceMuted: "#eef0f4",
  text: "#161a20",
  textMuted: "#464c57",
  textSubtle: "#585f6b",
  border: "#dcdfe5",
  borderStrong: "#c3c8d1",
  accent: "#0f6d4f",
  accentText: "#ffffff",
  accentTint: "#dff1e8",
  accentOnTint: "#0a4a35",
  goodBg: "#e4f4e4",
  goodText: "#105c18",
  goodBorder: "#b9e0bd",
  warnBg: "#fdf2db",
  warnText: "#6b4105",
  warnBorder: "#f2ddb0",
  badBg: "#fae8e8",
  badText: "#8f1f1f",
  badBorder: "#f0c4c4",
  infoBg: "#e6f0fe",
  infoText: "#1a4fb0",
  infoBorder: "#b9d3fb",
  neutralBg: "#eef0f4",
  neutralText: "#464c57",
  neutralBorder: "#d6dae1",
};

export const darkPalette: Palette = {
  background: "#0f1317",
  surface: "#171c22",
  surfaceMuted: "#1f252c",
  text: "#f2f4f7",
  textMuted: "#aeb6c1",
  textSubtle: "#98a1ad",
  border: "#2a313a",
  borderStrong: "#3b434e",
  accent: "#3bb98c",
  accentText: "#06261a",
  accentTint: "#13342a",
  accentOnTint: "#93e3c2",
  goodBg: "#16291b",
  goodText: "#86e79c",
  goodBorder: "#2b4a33",
  warnBg: "#2e2512",
  warnText: "#f5cd63",
  warnBorder: "#4d3f1d",
  badBg: "#2c1e26",
  badText: "#f5a4a4",
  badBorder: "#53303a",
  infoBg: "#16233a",
  infoText: "#a3c9f9",
  infoBorder: "#2b4068",
  neutralBg: "#1f252c",
  neutralText: "#aeb6c1",
  neutralBorder: "#333b45",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 22, fontWeight: "700" },
  title: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 15, fontWeight: "400" },
  label: { fontSize: 13, fontWeight: "500" },
  caption: { fontSize: 12, fontWeight: "400" },
} as const;

export interface Theme {
  colors: Palette;
  dark: boolean;
}

export const lightTheme: Theme = { colors: lightPalette, dark: false };
export const darkTheme: Theme = { colors: darkPalette, dark: true };
