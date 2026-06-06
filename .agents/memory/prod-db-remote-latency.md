---
name: Production DB remote latency & batch writes
description: Why one-off write/maintenance scripts against the production database must be chunked into small batches.
---

The production database is a **remote Neon instance in ap-southeast-1 (Singapore)**, reached from the container over high-latency links — every row insert is a network round-trip, so write-heavy scripts (e.g. demo/sample enrichment that also generates PDFs) are far slower against prod than against the local dev DB.

**Constraints that bite:**
- The `bash` tool caps at **120s**; a full multi-project write run exceeds it and is killed with no output (output piped through `tail` is also lost on kill).
- Backgrounded processes (`nohup ... &`) do **not** survive the bash tool returning — the tool tears down the process group, so polling a log file fails (file never written).

**How to apply:** run prod write scripts in **small batches** (e.g. 2 projects per invocation) via an env-var filter, with direct (un-piped) output so partial progress is visible, each invocation comfortably under 120s. Rely on the script's per-item idempotency so re-running/overlapping batches is safe.

**Why:** discovered while running `lib/db/src/sample-demo-enrichment.ts` against prod — full and even 4-project runs timed out; single/2-project runs completed in 15–47s.
