export default function MonorepoLayout() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="relative h-full flex flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1vw] mb-[1.5vh]">
          <div className="w-[0.35vw] h-[3.2vh] bg-primary" />
          <span className="font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
            Monorepo Layout
          </span>
        </div>
        <h2 className="font-display font-bold text-[3.2vw] tracking-tight leading-tight mb-[4.5vh]">
          Apps stay thin, shared code lives in{" "}
          <span className="text-primary">lib/</span>
        </h2>

        <div className="flex-1 flex gap-[3vw]">
          <div className="w-[46vw] border border-border bg-bg-elevated px-[2vw] py-[3vh] font-mono text-[1.05vw] leading-relaxed">
            <div className="text-accent">pnpm-workspace/</div>
            <div className="pl-[1.5vw] mt-[1.2vh] text-text">artifacts/</div>
            <div className="pl-[3vw] text-muted">
              <span className="text-text">web</span> — React + Vite frontend
            </div>
            <div className="pl-[3vw] text-muted">
              <span className="text-text">api-server</span> — Express REST API
            </div>
            <div className="pl-[3vw] text-muted">
              <span className="text-text">mobile</span> — Expo mobile app
            </div>
            <div className="pl-[1.5vw] mt-[1.8vh] text-primary">lib/</div>
            <div className="pl-[3vw] text-muted">
              <span className="text-text">api-spec</span> — OpenAPI 3 contract
            </div>
            <div className="pl-[3vw] text-muted">
              <span className="text-text">api-client-react</span> — generated
              hooks
            </div>
            <div className="pl-[3vw] text-muted">
              <span className="text-text">api-zod</span> — generated schemas
            </div>
            <div className="pl-[3vw] text-muted">
              <span className="text-text">db</span> — Prisma schema + client
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-[3.2vh]">
            <div className="flex gap-[1.2vw]">
              <div className="font-mono text-[1.1vw] text-primary pt-[0.3vh]">
                01
              </div>
              <div>
                <div className="font-display font-bold text-[1.4vw] leading-tight">
                  One install, one typecheck
                </div>
                <div className="text-[1.05vw] text-muted mt-[0.5vh] leading-snug">
                  Every package is versioned and built together — no drift
                  between apps.
                </div>
              </div>
            </div>
            <div className="flex gap-[1.2vw]">
              <div className="font-mono text-[1.1vw] text-primary pt-[0.3vh]">
                02
              </div>
              <div>
                <div className="font-display font-bold text-[1.4vw] leading-tight">
                  Shared logic is written once
                </div>
                <div className="text-[1.05vw] text-muted mt-[0.5vh] leading-snug">
                  Database access, API types, and validation live in lib/ and
                  are imported by all three apps.
                </div>
              </div>
            </div>
            <div className="flex gap-[1.2vw]">
              <div className="font-mono text-[1.1vw] text-primary pt-[0.3vh]">
                03
              </div>
              <div>
                <div className="font-display font-bold text-[1.4vw] leading-tight">
                  Strict TypeScript everywhere
                </div>
                <div className="text-[1.05vw] text-muted mt-[0.5vh] leading-snug">
                  A contract change that breaks a client fails the build — not
                  production.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-[3.5vh] border-t border-border pt-[2vh] flex items-center justify-end">
          <div className="font-mono text-[0.9vw] text-muted tracking-widest">
            03 / 10
          </div>
        </div>
      </div>
    </div>
  );
}
