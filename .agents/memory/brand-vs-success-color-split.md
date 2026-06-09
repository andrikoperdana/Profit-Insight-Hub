---
name: Brand color vs success-semantic color split
description: When re-theming the brand --primary to a non-green color, positive-semantic uses of primary must move to --success or they read as the new brand color.
---

When the web app's brand `--primary` was green, developers used `text-primary`/`bg-primary` for BOTH brand/action emphasis AND positive financial semantics (profit, approved, healthy, active, high margin). The two meanings were silently conflated.

**Rule:** If you change `--primary` to any non-green brand color (e.g. ITSEC red 357 88% 47%), you MUST migrate every *positive-meaning* `text-primary`/`bg-primary` to the green `--success` token (or emerald-500 utilities, the existing convention) — otherwise profit values, trend-up arrows, "Approved" badges, "Active" status, and high-margin badges all wrongly render in the alarm/brand color.

**Why:** This is a financial app; green=good/profit and red=loss/danger is load-bearing UX meaning. A redesign that only swaps the token leaves semantics broken even though the build passes (className-only, no type errors).

**How to apply:**
- Distinguish *positive-semantic* from *neutral brand-accent* uses. Migrate only the positive ones. Neutral brand-accent icons (section-title icons, rank `#1` chips, role badges in Header) legitimately stay primary/red.
- The reliable positive-signal patterns to migrate: ternaries `X >= 0 ? "text-primary" : "text-destructive"`, `>= 20/30 ? "text-primary"`, `tone === "good" ? "text-primary"`, paired `<TrendingUp ... text-primary /> : <TrendingDown ... text-destructive />`, and status badges (APPROVED, ACTIVE, COMPLETE, high MarginBadge) using `bg-primary/10 text-primary border-primary/20`.
- `.text-success`/`.bg-success` utilities (green, 142 71% 45%) are defined in `index.css`; emerald-500/10 utilities are the existing badge convention.
- Keep brand `--primary` (button bg, white text) ≥ ~4.5:1 contrast: a vivid red like 357 88% 47% gives ~5:1 white-on-red on dark. Brand-red and `--destructive` are inherently close in a red brand — accept it or push destructive deeper/desaturated (e.g. 0 62% 46%).
- Theme is token-based (HSL vars in `index.css`, `@theme inline` maps to Tailwind, dark forced via `<html class="dark">`), so Sidebar/Header/buttons re-skin automatically; only hardcoded color classes need manual attention.
