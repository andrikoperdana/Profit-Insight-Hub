---
name: Mobile non-tab routes vs root auth guard
description: Any new expo-router screen outside (tabs) must be whitelisted in the root layout redirect or signed-in users get bounced to "/".
---

The mobile root layout (`artifacts/mobile/app/_layout.tsx`) redirects any signed-in user whose first route segment isn't `(tabs)` back to `/`.

**Why:** the guard was written when tabs + login were the only routes; adding a detail screen (e.g. `app/project/[id].tsx`) silently bounced navigation until its segment ("project") was added to the allowlist.

**How to apply:** when adding any screen outside `(tabs)`, extend the `inDetail`/allowlist check in `RootLayoutNav` alongside creating the route file.
