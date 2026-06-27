---
name: Deployment build includes heavy mobile Expo bundle
description: Why the autoscale publish build is slow/flaky and how to triage a "connection lost" build failure
---

The production publish builds every artifact that has a `[services.production]` block: web (vite, cheap), api-server (esbuild, ~1s), and **mobile (Expo)**. The mobile build (`node scripts/build.js`) spins up Metro and bundles BOTH iOS and Android ("static Expo Go deployment"), each taking ~45-55s and is by far the heaviest, most memory-intensive step of the whole build on the cr-2-4 (2 vCPU / 4GB) worker. secureprofit-deck and mockup-sandbox have no production block, so they are NOT deployed.

**Triage rule:** a publish that dies fast (~45s) during the mobile Metro bundle phase with repeated `Security scan skipped: connection lost` and NO compilation/dependency error is a transient infra/worker connectivity (likely OOM/connection) failure, not a code defect — especially when the identical code published successfully earlier. The api-server/web builds succeeding in the same log confirms app code is fine.

**Why:** Metro bundling iOS+Android with React Compiler peaks memory right at the worker's edge; a transient drop there fails the build even though nothing in the repo changed.

**How to apply:** First action is retry the publish (suggestDeploy). Do NOT pre-emptively gut the config. Only if it recurs across retries, make the deploy build lighter — candidates: exclude the mobile artifact from the web deployment (remove its `[services.production]`), or reduce its build to a single platform. Treat removing mobile-in-deploy as a product/scope decision — confirm with the user first.
