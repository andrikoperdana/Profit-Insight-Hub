/**
 * Design tokens for the mobile app — synced from the sibling web artifact's
 * dark "ITSEC Red" theme (artifacts/web/src/index.css `.dark`).
 *
 * The app is dark-only, so the same palette is used for both the light and
 * dark keys. This forces a consistent appearance regardless of the device's
 * system color scheme.
 */

const dark = {
  // Legacy aliases (kept for backward compatibility)
  text: "#F5F5F5",
  tint: "#E10E19",

  // Core surfaces
  background: "#0A0A0A",
  foreground: "#F5F5F5",

  // Cards / elevated surfaces
  card: "#121212",
  cardForeground: "#F5F5F5",

  // Primary action color (ITSEC red)
  primary: "#E10E19",
  primaryForeground: "#FFFFFF",

  // Secondary / less-emphasis interactive surfaces
  secondary: "#242424",
  secondaryForeground: "#FAFAFA",

  // Muted / subdued elements (dividers, timestamps, placeholders)
  muted: "#242424",
  mutedForeground: "#A3A3A3",

  // Accent highlights (badges, selected items, focus rings)
  accent: "#292929",
  accentForeground: "#FAFAFA",

  // Destructive actions (delete, reject, error states)
  destructive: "#BE2D2D",
  destructiveForeground: "#FFFFFF",

  // Status colors
  warning: "#F59F0A",
  info: "#3EBAF4",

  // Borders and input outlines
  border: "#262626",
  input: "#262626",
};

const colors = {
  light: dark,
  dark,
  radius: 12,
};

export default colors;
