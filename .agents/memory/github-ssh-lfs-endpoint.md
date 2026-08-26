---
name: GitHub SSH deploy and LFS endpoint
description: Why GitHub SSH pushes can still prompt for an internal Replit password when Git LFS is enabled.
---

When GitHub HTTPS authentication is unavailable, this repository can push through a repository-scoped GitHub SSH deploy key with write access.

**Why:** Replit-created remotes may retain a per-remote Git LFS URL pointing at `ssh.spock.replit.dev`. Changing only the Git remote URL to GitHub SSH leaves LFS uploads targeting the internal Replit endpoint, causing a password prompt even though GitHub SSH authentication succeeds.

**How to apply:** For the active GitHub remote, remove its stale `remote.<name>.lfsurl` override so Git LFS derives the GitHub endpoint from the SSH remote. Verify with `git lfs env`, run a Git-only dry run with LFS upload skipped, then perform the real push and confirm zero divergence.