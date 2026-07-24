export default function RuntimeDelivery() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="relative h-full flex flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1vw] mb-[1.5vh]">
          <div className="w-[0.35vw] h-[3.2vh] bg-primary" />
          <span className="font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
            Runtime &amp; Delivery
          </span>
        </div>
        <h2 className="font-display font-bold text-[3.2vw] tracking-tight leading-tight mb-[4.5vh]">
          One codebase, deployed as one unit
        </h2>

        <div className="flex-1 flex gap-[3vw]">
          <div className="w-[42vw]">
            <div className="font-mono text-[0.85vw] tracking-widest text-accent uppercase mb-[1.8vh]">
              The stack
            </div>
            <div className="flex flex-wrap gap-[0.8vw]">
              <span className="border border-border bg-bg-elevated font-mono text-[1vw] px-[1.2vw] py-[1.2vh]">
                React + Vite
              </span>
              <span className="border border-border bg-bg-elevated font-mono text-[1vw] px-[1.2vw] py-[1.2vh]">
                Express
              </span>
              <span className="border border-border bg-bg-elevated font-mono text-[1vw] px-[1.2vw] py-[1.2vh]">
                Prisma
              </span>
              <span className="border border-border bg-bg-elevated font-mono text-[1vw] px-[1.2vw] py-[1.2vh]">
                PostgreSQL
              </span>
              <span className="border border-border bg-bg-elevated font-mono text-[1vw] px-[1.2vw] py-[1.2vh]">
                Expo
              </span>
              <span className="border border-border bg-bg-elevated font-mono text-[1vw] px-[1.2vw] py-[1.2vh]">
                TypeScript
              </span>
              <span className="border border-border bg-bg-elevated font-mono text-[1vw] px-[1.2vw] py-[1.2vh]">
                Tailwind CSS
              </span>
              <span className="border border-border bg-bg-elevated font-mono text-[1vw] px-[1.2vw] py-[1.2vh]">
                OpenAPI 3
              </span>
            </div>

            <div className="mt-[5vh] border border-primary/60 bg-bg-elevated px-[1.8vw] py-[3vh]">
              <div className="font-display font-bold text-[1.5vw] leading-tight">
                SecureProfit Hub
              </div>
              <div className="text-[1.05vw] text-muted mt-[1vh] leading-snug">
                Web, mobile, and client portal — one platform tracking every
                project from intake to closed, with margin visible at every
                step.
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-[3.2vh]">
            <div className="flex gap-[1.2vw]">
              <div className="font-mono text-[1.1vw] text-primary pt-[0.3vh]">
                01
              </div>
              <div>
                <div className="font-display font-bold text-[1.4vw] leading-tight">
                  Autoscale deployment
                </div>
                <div className="text-[1.05vw] text-muted mt-[0.5vh] leading-snug">
                  Web, API, and mobile bundle build together and ship behind a
                  single shared proxy.
                </div>
              </div>
            </div>
            <div className="flex gap-[1.2vw]">
              <div className="font-mono text-[1.1vw] text-primary pt-[0.3vh]">
                02
              </div>
              <div>
                <div className="font-display font-bold text-[1.4vw] leading-tight">
                  Reviewed schema migrations
                </div>
                <div className="text-[1.05vw] text-muted mt-[0.5vh] leading-snug">
                  Database changes ship as versioned migration files, applied
                  to production deliberately — never automatically.
                </div>
              </div>
            </div>
            <div className="flex gap-[1.2vw]">
              <div className="font-mono text-[1.1vw] text-primary pt-[0.3vh]">
                03
              </div>
              <div>
                <div className="font-display font-bold text-[1.4vw] leading-tight">
                  Separate dev and production data
                </div>
                <div className="text-[1.05vw] text-muted mt-[0.5vh] leading-snug">
                  A seeded development database mirrors production structure,
                  so features are tested on realistic data first.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-[3.5vh] border-t border-border pt-[2vh] flex items-center justify-between">
          <div className="font-mono text-[0.9vw] text-muted tracking-widest uppercase">
            SecureProfit Hub · Technical Overview
          </div>
          <div className="font-mono text-[0.9vw] text-muted tracking-widest">
            10 / 10
          </div>
        </div>
      </div>
    </div>
  );
}
