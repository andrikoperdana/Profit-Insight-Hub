---
name: code_execution sandbox does not inherit Replit Secrets
description: Where to read env secrets when scripting against prod (sandbox vs bash shell).
---

# Reading secrets when scripting against production

The `code_execution` (JS notebook) sandbox does **NOT** inherit Replit Secrets or
deployment env vars — `process.env.X` / `globalThis.process.env.X` return undefined
**even after `restart: true`**. The bash tool's shell **does** inherit them.

**Why:** the sandbox runs in an isolated context that is not handed the secret store;
restarting the notebook does not re-inject secrets.

**How to apply:** to use a secret (e.g. a prod password) in a script, write a Node
`.mjs` to `/tmp` that reads `process.env.X` and run it via the **bash** tool, never the
sandbox. Never echo the value. Confirm presence first with
`node -e "console.log(process.env.X ? 'present' : 'missing')"`.

Related: `viewEnvVars({type:"all"})` (callable from the sandbox) returns **secret**
values as booleans only, but plain **env vars** (non-secret) come back with real values —
that's how production `SITE_GATE_USER/PASS` were retrievable while `SESSION_SECRET` was not.

For writing prod data there is no SQL write path (`executeSql` production = read-only);
the only write path is the live HTTPS API, which sits behind the front-door site gate
(`POST /api/site-gate/login` first, reuse the `sp_gate` cookie). Note the deployed prod
build can lag the dev code (it answered `site_gate_required` / `/api/site-gate/*` while
dev had been refactored to the `/n` obfuscation). Also `clientWriteRoles = ["SALES"]` —
MANAGEMENT cannot create clients via the API.
