export default function SystemArchitecture() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="relative h-full flex flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1vw] mb-[1.5vh]">
          <div className="w-[0.35vw] h-[3.2vh] bg-primary" />
          <span className="font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
            System Architecture
          </span>
        </div>
        <h2 className="font-display font-bold text-[3.2vw] tracking-tight leading-tight mb-[4.5vh]">
          Three clients, one API, one database
        </h2>

        <div className="flex-1 flex items-center gap-[1.6vw]">
          <div className="flex flex-col gap-[2.2vh] w-[24vw]">
            <div className="border border-border bg-bg-elevated px-[1.5vw] py-[2.2vh]">
              <div className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mb-[0.8vh]">
                Web App
              </div>
              <div className="font-display font-bold text-[1.35vw] leading-tight">
                React + Vite
              </div>
              <div className="text-[1vw] text-muted mt-[0.6vh] leading-snug">
                Role-based dashboards, project workspace, reports
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.5vw] py-[2.2vh]">
              <div className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mb-[0.8vh]">
                Mobile App
              </div>
              <div className="font-display font-bold text-[1.35vw] leading-tight">
                Expo / React Native
              </div>
              <div className="text-[1vw] text-muted mt-[0.6vh] leading-snug">
                Timesheets and approvals on the go
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.5vw] py-[2.2vh]">
              <div className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mb-[0.8vh]">
                Client Portal
              </div>
              <div className="font-display font-bold text-[1.35vw] leading-tight">
                Public token link
              </div>
              <div className="text-[1vw] text-muted mt-[0.6vh] leading-snug">
                Read-only progress view, no login required
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center w-[6vw]">
            <span className="font-display text-[2.6vw] text-primary leading-none">
              &rarr;
            </span>
            <span className="font-mono text-[0.7vw] text-muted mt-[1vh] tracking-widest uppercase text-center">
              HTTPS + JWT
            </span>
          </div>

          <div className="border border-primary/60 bg-bg-elevated px-[1.8vw] py-[3.4vh] w-[26vw]">
            <div className="font-mono text-[0.8vw] tracking-widest text-primary uppercase mb-[1vh]">
              API Server
            </div>
            <div className="font-display font-bold text-[1.7vw] leading-tight">
              Express + TypeScript
            </div>
            <div className="mt-[2vh] flex flex-col gap-[1.2vh]">
              <div className="text-[1vw] text-muted leading-snug">
                JWT auth and role gates on every route
              </div>
              <div className="text-[1vw] text-muted leading-snug">
                Zod validation of inputs and outputs
              </div>
              <div className="text-[1vw] text-muted leading-snug">
                Business rules: lifecycle gates, approvals, financials
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center w-[6vw]">
            <span className="font-display text-[2.6vw] text-primary leading-none">
              &rarr;
            </span>
            <span className="font-mono text-[0.7vw] text-muted mt-[1vh] tracking-widest uppercase text-center">
              Prisma ORM
            </span>
          </div>

          <div className="border border-border bg-bg-elevated px-[1.8vw] py-[3.4vh] w-[22vw]">
            <div className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mb-[1vh]">
              Data
            </div>
            <div className="font-display font-bold text-[1.7vw] leading-tight">
              PostgreSQL
            </div>
            <div className="text-[1vw] text-muted mt-[2vh] leading-snug">
              Managed Neon instance, over 40 domain models covering projects,
              people, time, and money
            </div>
          </div>
        </div>

        <div className="mt-[3.5vh] border-t border-border pt-[2vh] flex items-center justify-between">
          <div className="font-mono text-[0.9vw] text-muted">
            One path-routed reverse proxy fronts every service — clients never
            talk to the database directly.
          </div>
          <div className="font-mono text-[0.9vw] text-muted tracking-widest">
            02 / 10
          </div>
        </div>
      </div>
    </div>
  );
}
