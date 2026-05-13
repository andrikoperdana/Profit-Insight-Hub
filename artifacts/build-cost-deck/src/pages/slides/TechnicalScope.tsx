export default function TechnicalScope() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[7vw] py-[7vh]">
      <div className="absolute top-[7vh] left-[7vw] w-[0.3vw] h-[5vh] bg-accent" />
      <div className="absolute top-[7vh] left-[8vw] font-mono text-[0.9vw] tracking-[0.3em] text-accent uppercase">
        05 &middot; Aktivitas Teknis
      </div>

      <div className="pt-[8vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.4vw] leading-[1.05] tracking-tight text-primary">
          Lima belas pekerjaan inti yang harus dikerjakan manual.
        </h2>
      </div>

      <div className="mt-[5vh] grid grid-cols-2 gap-x-[3vw] gap-y-[1.6vh]">
        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">2&ndash;3 hr</span>
          <span className="text-[1.1vw] text-text flex-1">Setup monorepo pnpm + TypeScript project references</span>
        </div>
        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">3&ndash;5 hr</span>
          <span className="text-[1.1vw] text-text flex-1">OpenAPI spec + codegen (Orval React Query + Zod)</span>
        </div>

        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">1&ndash;2 mg</span>
          <span className="text-[1.1vw] text-text flex-1">Prisma schema 20+ model + relasi + enum</span>
        </div>
        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">1 mg</span>
          <span className="text-[1.1vw] text-text flex-1">Auth JWT + matriks permission 10 role</span>
        </div>

        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">4&ndash;5 mg</span>
          <span className="text-[1.1vw] text-text flex-1">35+ REST endpoint dengan validasi Zod &amp; audit log</span>
        </div>
        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">1 mg</span>
          <span className="text-[1.1vw] text-text flex-1">Kalkulasi finansial (resourceCost, margin, forecast)</span>
        </div>

        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">1 mg</span>
          <span className="text-[1.1vw] text-text flex-1">Approval workflow timesheet + expense (status machine)</span>
        </div>
        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">2&ndash;3 mg</span>
          <span className="text-[1.1vw] text-text flex-1">6 dashboard per role + KPI charts (Recharts)</span>
        </div>

        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh] bg-accent/10 -mx-[1vw] px-[1vw]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">2&ndash;3 mg</span>
          <span className="text-[1.1vw] text-primary font-semibold flex-1">Custom Gantt drag-resize + dependency arrows SVG</span>
        </div>
        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">1 mg</span>
          <span className="text-[1.1vw] text-text flex-1">WBS tree task + multi-assignee + cycle detection</span>
        </div>

        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">1 mg</span>
          <span className="text-[1.1vw] text-text flex-1">Resource Planning matrix per BU per minggu</span>
        </div>
        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">1 mg</span>
          <span className="text-[1.1vw] text-text flex-1">Halaman admin: Users, Skills, BU, Audit Log</span>
        </div>

        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">2&ndash;3 hr</span>
          <span className="text-[1.1vw] text-text flex-1">Seed data realistis (11 user, 5 project, 150 timesheet)</span>
        </div>
        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">3&ndash;4 mg</span>
          <span className="text-[1.1vw] text-text flex-1">Testing E2E + bug fixing per role</span>
        </div>

        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">1&ndash;2 mg</span>
          <span className="text-[1.1vw] text-text flex-1">Dokumentasi user manual + technical doc</span>
        </div>
        <div className="flex items-baseline gap-[1.2vw] border-b border-border pb-[1.2vh]">
          <span className="font-mono text-[1vw] text-accent w-[3vw]">1 mg</span>
          <span className="text-[1.1vw] text-text flex-1">Setup CI/CD, monitoring (Sentry, uptime, log)</span>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[7vw] font-mono text-[0.9vw] text-muted tracking-widest">
        05 / 09
      </div>
    </div>
  );
}
