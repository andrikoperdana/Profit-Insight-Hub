---
name: Atomic project closing
description: Concurrency rule for project-close gates and mutations that satisfy or revoke them.
---

Project closure must reassert every applicable readiness condition in the same conditional database update that changes the project from COMPLETE to CLOSED. CSAT waiver grant/removal must also conditionally update that same Project row while it is still a live CLIENT project in COMPLETE.

**Why:** A read-check-write flow lets a close request validate an active waiver while a concurrent request removes it, after which the stale close can still succeed. Conditional updates on the same row make PostgreSQL re-evaluate the losing request against the winner's state.

**How to apply:** When a new close requirement or exception is added, include it in both the human-readable readiness check and the atomic close predicate. Any mutation that can satisfy or revoke a close gate must either conditionally touch the Project row or share an equivalent serialization lock.