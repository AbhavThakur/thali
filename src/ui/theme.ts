import Storage from "./kv";
import { Appearance } from "react-native";

export type ThemeMode = "system" | "light" | "dark";
const MODE_KEY = "theme_mode";

export function getThemeMode(): ThemeMode {
  const v = Storage.getItemSync(MODE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export const setThemeMode = (m: ThemeMode) => Storage.setItemSync(MODE_KEY, m);

// Styles are built once when the app starts, so the theme is decided here, at start-up.
// Changing it in Me takes effect the next time the app is opened.
const mode = getThemeMode();
export const isDark =
  mode === "dark" ||
  (mode === "system" && Appearance.getColorScheme() === "dark");

const light = {
  // 5.0:1 with white and 4.8:1 on the page background (WCAG AA); the brighter #2EB583 lives on in the app icon.
  primary: "#0A7F58",
  /** Green for words and icons: same as `primary` on light, brighter on dark. */
  primaryText: "#0A7F58",
  /** Amber for graphics (3.2:1 on white); use `warnText` for words. */
  warn: "#D97706",
  warnText: "#B45309",
  danger: "#DC2626",
  protein: "#34D399",
  carbs: "#FB923C",
  fat: "#F87171",
  fiber: "#3B82F6",
  bg: "#F8FAFC",
  card: "#FFFFFF",
  track: "#E2E8F0",
  text: "#0F172A",
  muted: "#64748B",
  /** Soft green panel and its text. */
  tint: "#ECFDF5",
  tintText: "#065F46",
  /** Soft amber panel and its text. */
  warnTint: "#FEF3C7",
  warnTintText: "#92400E",
};

const night: typeof light = {
  primary: "#0A7F58",
  primaryText: "#4ADE80",
  warn: "#F59E0B",
  warnText: "#FBBF24",
  danger: "#F87171",
  protein: "#34D399",
  carbs: "#FB923C",
  fat: "#F87171",
  fiber: "#60A5FA",
  bg: "#0B1220",
  card: "#131C2E",
  track: "#26324A",
  text: "#E8EEF8",
  muted: "#9AA8BF",
  tint: "#10302A",
  tintText: "#6EE7B7",
  warnTint: "#3A2D10",
  warnTintText: "#FCD34D",
};

export const colors = isDark ? night : light;

export const card = {
  backgroundColor: colors.card,
  borderRadius: 16,
  padding: 16,
  marginHorizontal: 16,
  marginBottom: 12,
  shadowColor: "#000",
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;
