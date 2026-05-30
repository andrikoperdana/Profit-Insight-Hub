---
name: Generated hook query options require queryKey
description: Orval-generated React Query hooks in this repo force an explicit queryKey when you pass a `query` options object.
---

When calling any generated hook from `@workspace/api-client-react` (e.g. `useListMyTasks`, `useListProjects`) with a `{ query: {...} }` options object, you MUST include `queryKey` inside `query`, even just to set `enabled`. Omitting it is a TS2741 compile error ("Property 'queryKey' is missing").

Example:
```ts
useListMyTasks({ query: { enabled: open, queryKey: ["my-tasks", "weekly-entry"] } })
```

**Why:** This repo's Orval config types `query` as the full `UseQueryOptions` with `queryKey` required, unlike Orval's common default where the hook supplies the queryKey automatically. Reaching for `as any` to silence it loses type safety and is unnecessary — just pass a stable queryKey.

**How to apply:** Any time you need `enabled`, `staleTime`, etc. on a generated query hook, add a queryKey alongside it. Match the existing pattern in the same file (other calls already pass explicit queryKeys).
