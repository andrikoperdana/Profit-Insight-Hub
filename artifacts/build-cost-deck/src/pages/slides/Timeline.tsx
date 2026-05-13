export default function Timeline() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[7vw] py-[7vh]">
      <div className="absolute top-[7vh] left-[7vw] w-[0.3vw] h-[5vh] bg-accent" />
      <div className="absolute top-[7vh] left-[8vw] font-mono text-[0.9vw] tracking-[0.3em] text-accent uppercase">
        04 &middot; Timeline 6 Fase
      </div>

      <div className="pt-[8vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.4vw] leading-[1.05] tracking-tight text-primary">
          Dari discovery ke production dalam enam fase berurutan.
        </h2>
      </div>

      <div className="mt-[5vh] grid grid-cols-6 gap-[0.8vw]">
        <div className="border-t-[0.4vw] border-accent pt-[1.5vh]">
          <div className="font-mono text-[0.75vw] text-accent tracking-widest">
            FASE 1
          </div>
          <div className="font-display font-bold text-[1.4vw] text-primary mt-[0.8vh] leading-tight">
            Discovery &amp; Analisis
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1vh]">
            3&ndash;4 minggu
          </div>
          <p className="text-[0.9vw] text-muted mt-[1.5vh] leading-snug">
            SA gali requirement 10 role, susun BRD, ERD, wireframe.
          </p>
        </div>

        <div className="border-t-[0.4vw] border-accent pt-[1.5vh]">
          <div className="font-mono text-[0.75vw] text-accent tracking-widest">
            FASE 2
          </div>
          <div className="font-display font-bold text-[1.4vw] text-primary mt-[0.8vh] leading-tight">
            Setup &amp; Arsitektur
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1vh]">
            2 minggu
          </div>
          <p className="text-[0.9vw] text-muted mt-[1.5vh] leading-snug">
            Monorepo, Prisma, OpenAPI codegen, JWT auth, role middleware, CI.
          </p>
        </div>

        <div className="border-t-[0.4vw] border-accent pt-[1.5vh]">
          <div className="font-mono text-[0.75vw] text-accent tracking-widest">
            FASE 3
          </div>
          <div className="font-display font-bold text-[1.4vw] text-primary mt-[0.8vh] leading-tight">
            Backend
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1vh]">
            6&ndash;8 minggu
          </div>
          <p className="text-[0.9vw] text-muted mt-[1.5vh] leading-snug">
            ~35 endpoint, validasi Zod, kalkulasi margin, workflow approval.
          </p>
        </div>

        <div className="border-t-[0.4vw] border-accent pt-[1.5vh]">
          <div className="font-mono text-[0.75vw] text-accent tracking-widest">
            FASE 4
          </div>
          <div className="font-display font-bold text-[1.4vw] text-primary mt-[0.8vh] leading-tight">
            Frontend
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1vh]">
            8&ndash;10 minggu
          </div>
          <p className="text-[0.9vw] text-muted mt-[1.5vh] leading-snug">
            15+ halaman, 6 dashboard per role, Gantt + dependency arrows.
          </p>
        </div>

        <div className="border-t-[0.4vw] border-accent pt-[1.5vh]">
          <div className="font-mono text-[0.75vw] text-accent tracking-widest">
            FASE 5
          </div>
          <div className="font-display font-bold text-[1.4vw] text-primary mt-[0.8vh] leading-tight">
            Integrasi &amp; QA
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1vh]">
            3&ndash;4 minggu
          </div>
          <p className="text-[0.9vw] text-muted mt-[1.5vh] leading-snug">
            E2E test per role, uji invariant otorisasi, perf tuning, seed data.
          </p>
        </div>

        <div className="border-t-[0.4vw] border-accent pt-[1.5vh] bg-primary/5 px-[0.8vw] -mx-[0.4vw]">
          <div className="font-mono text-[0.75vw] text-accent tracking-widest">
            FASE 6
          </div>
          <div className="font-display font-bold text-[1.4vw] text-primary mt-[0.8vh] leading-tight">
            UAT &amp; Deploy
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1vh]">
            2 minggu
          </div>
          <p className="text-[0.9vw] text-muted mt-[1.5vh] leading-snug">
            UAT bersama 10 role, dokumentasi, training, deploy production.
          </p>
        </div>
      </div>

      <div className="mt-[6vh] bg-bg-elevated border border-border px-[2.5vw] py-[3vh] flex items-center justify-between">
        <div>
          <div className="font-mono text-[0.8vw] text-accent tracking-widest uppercase">
            Total Kalender
          </div>
          <div className="font-display font-bold text-[3.2vw] text-primary leading-none mt-[1vh]">
            22&ndash;26 minggu
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[0.8vw] text-accent tracking-widest uppercase">
            Setara
          </div>
          <div className="font-display font-bold text-[3.2vw] text-primary leading-none mt-[1vh]">
            5&ndash;6 bulan
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[0.8vw] text-accent tracking-widest uppercase">
            Effort
          </div>
          <div className="font-display font-bold text-[3.2vw] text-primary leading-none mt-[1vh]">
            22&ndash;28 PM
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[7vw] font-mono text-[0.9vw] text-muted tracking-widest">
        04 / 09
      </div>
    </div>
  );
}
