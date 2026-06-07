/**
 * Design tokens for the mobile app — synced from the sibling web artifact's
 * dark "cyber-green" theme (artifacts/web/src/index.css `.dark`).
 *
 * The app is dark-only, so the same palette is used for both the light and
 * dark keys. This forces a consistent appearance regardless of the device's
 * system color scheme.
 */

const dark = {
  // Legacy aliases (kept for backward compatibility)
  text: "#E1E7EF",
  tint: "#22C55E",

  // Core surfaces
  background: "#030711",
  foreground: "#E1E7EF",

  // Cards / elevated surfaces
  card: "#0B1424",
  cardForeground: "#E1E7EF",

  // Primary action color (emerald / cyber-green)
  primary: "#22C55E",
  primaryForeground: "#04140A",

  // Secondary / less-emphasis interactive surfaces
  secondary: "#111B2E",
  secondaryForeground: "#E1E7EF",

  // Muted / subdued elements (dividers, timestamps, placeholders)
  muted: "#111B2E",
  mutedForeground: "#94A3B8",

  // Accent highlights (badges, selected items, focus rings)
  accent: "#162236",
  accentForeground: "#E1E7EF",

  // Destructive actions (delete, reject, error states)
  destructive: "#EF4444",
  destructiveForeground: "#FFFFFF",

  // Status colors
  warning: "#F59E0B",
  info: "#38BDF8",

  // Borders and input outlines
  border: "#1D2839",
  input: "#1D2839",
};

const colors = {
  light: dark,
  dark,
  radius: 12,
};

export default colors;
