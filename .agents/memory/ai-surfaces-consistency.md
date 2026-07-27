---
name: AI surfaces consistency
description: Rules that keep AI assistant chat, weekly digest, and future AI features consistent and race-free
---

# Shared billing totals (single source)

Any AI surface that reports billing money (overdue, outstanding, due-soon) must compute totals via the shared open-milestones helper in the api-server lib (`billing-facts`), never its own Prisma query.

**Why:** Chat and the weekly digest once each summed over their own `take`-capped queries (200 vs 300 rows) and reported different overdue totals (Rp 5.7 B vs Rp 7.2 B) for the same data. Sums over `take`-limited results silently undercount as data grows; two independent implementations of `amount ?? percentage*contractValue` drift.

**How to apply:** Fetch ALL open (PLANNED/INVOICED, non-deleted project) milestones with the narrow select — the table is small (a few rows per contract). Filter/slice for display AFTER summing. Pass a project scope for role-limited callers (PM/Admin Project see own projects only).

# Weekly digest notify-once (single-winner claim)

The weekly digest row id IS the WIB ISO week key. Writing it must be create-first: `create` → winner sends management notifications; catch P2002 → loser skips notify (and only updates content when the caller explicitly forced a regenerate).

**Why:** check-existing → upsert → notify-if-absent is a check-then-act race; a manual regenerate racing the hourly scheduler double-called the LLM and double-notified management.

**How to apply:** Any "once per period" side effect (notify, email) must key off winning the unique-row create, not off a pre-read. Same family as ProjectBaseline single-current and invoice-number allocation.

# Other AI-feature invariants (context)

- LLM never computes: deterministic facts JSON in, phrasing out (`response_format: json_object`, zod-parsed, links sanitized against an allowed set built from the facts).
- Assistant chat tools are server-side role-scoped, default-deny; money only for portfolio-money roles or PM/Admin Project on their own projects.
- Email allowlist test pins the exact `EMAIL_NOTIFICATION_TYPES` set size — adding a notification type to the allowlist requires updating that test.
