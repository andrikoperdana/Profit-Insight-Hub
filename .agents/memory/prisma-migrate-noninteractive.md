---
name: Prisma migrate in non-interactive shells
description: Why `pnpm ... run migrate` hangs for the agent and the command that works instead.
---

# Prisma migrate from the agent's bash

`pnpm --filter @workspace/db run migrate` (the documented dev command) HANGS when
run from the agent's non-interactive bash: `prisma migrate dev` prompts for a
migration name on stdin and never gets one, so the tool call times out.

**Use instead** (names the migration up front and closes stdin):

```
pnpm --filter @workspace/db exec prisma migrate dev --name <snake_name> --skip-generate < /dev/null
```

Then regenerate the client separately: `pnpm --filter @workspace/db run generate`.

**Why:** the interactive name prompt has no TTY in tool-run shells. `--name` +
`< /dev/null` makes it fully non-interactive; `--skip-generate` keeps it fast and
lets you run `generate` as its own step.

**How to apply:** any time you add/modify `schema.prisma` and need a migration
from a tool call. Plain `run migrate` is fine for a human in an interactive
terminal — this gotcha is specific to the agent's bash.
