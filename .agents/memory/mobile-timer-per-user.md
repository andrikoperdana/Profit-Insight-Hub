---
name: Phone-only timer must be namespaced per user
description: A device-local (AsyncStorage) running-timer must be keyed by user id, or it leaks across accounts on a shared phone.
---

# Phone-only timer must be namespaced per user

A clock-in/out timer persisted only on the device (AsyncStorage, no server session) must use a
key namespaced by the authenticated user id (e.g. `active_timer:<userId>`), and the restore-on-mount
effect must depend on that key.

**Why:** with a single global key, User A logging out with a running timer leaves the entry behind;
User B logs in on the same phone, the Track screen restores A's timer/project/task, and B can submit
hours under B's account using A's session — a correctness/integrity bug. Namespacing makes restore
read only the current user's timer, so it can never bleed across accounts; it also lets the same user
resume their own timer after re-login.

**How to apply:** key any device-local in-progress work (timers, drafts) by user id whenever the
device may be shared and there is no server-side session tying the work to the account.
