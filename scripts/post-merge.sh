#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/db run migrate:deploy
