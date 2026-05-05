#!/usr/bin/env node
/**
 * Orval emits `lib/api-zod/src/index.ts` that re-exports both
 * `./generated/api` (zod schemas as values) and `./generated/types`
 * (TS interfaces). Body schemas (e.g. `LoginBody`, `UpdateTaskBody`)
 * appear in both places under the same name, causing TS2308 ambiguity.
 *
 * The interfaces in `generated/types` are not consumed via this barrel
 * (api-client-react has its own types; only api-server/health.ts imports
 * `HealthCheckResponse` from `@workspace/api-zod`, which is a value).
 *
 * So we rewrite the barrel to only re-export the zod values.
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const barrel = path.resolve(here, "..", "..", "api-zod", "src", "index.ts");
const desired = `export * from "./generated/api";\n`;
fs.writeFileSync(barrel, desired);
console.log(`[fix-zod-barrel] rewrote ${path.relative(process.cwd(), barrel)}`);
