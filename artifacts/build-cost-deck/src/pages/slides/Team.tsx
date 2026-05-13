export default function Team() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[7vw] py-[7vh]">
      <div className="absolute top-[7vh] left-[7vw] w-[0.3vw] h-[5vh] bg-accent" />
      <div className="absolute top-[7vh] left-[8vw] font-mono text-[0.9vw] tracking-[0.3em] text-accent uppercase">
        03 &middot; Komposisi Tim
      </div>

      <div className="pt-[8vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.4vw] leading-[1.05] tracking-tight text-primary">
          Lima peran, satu meja kerja.
        </h2>
        <p className="mt-[1.8vh] text-[1.2vw] text-muted max-w-[58vw] leading-snug">
          Tim ramping namun lengkap. Setiap peran punya tanggung jawab spesifik
          agar tidak terjadi tumpang tindih atau bottleneck.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-5 gap-[1.2vw]">
        <div className="bg-bg-elevated border border-border px-[1.4vw] py-[2.4vh]">
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Lead
          </div>
          <div className="font-display font-bold text-[1.5vw] text-primary mt-[1vh] leading-tight">
            Project Manager
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1.2vh]">
            Rp 20&ndash;35 jt/bln
          </div>
          <p className="text-[0.95vw] text-muted mt-[2vh] leading-snug">
            Scope control, manage 10 stakeholder role, agile delivery, mitigasi
            risiko.
          </p>
        </div>

        <div className="bg-bg-elevated border border-border px-[1.4vw] py-[2.4vh]">
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Analysis
          </div>
          <div className="font-display font-bold text-[1.5vw] text-primary mt-[1vh] leading-tight">
            System Analyst
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1.2vh]">
            Rp 15&ndash;25 jt/bln
          </div>
          <p className="text-[0.95vw] text-muted mt-[2vh] leading-snug">
            BPMN, ERD, BRD/SRS, alur Sales &rarr; PMO &rarr; PM &rarr; Principal.
          </p>
        </div>

        <div className="bg-bg-elevated border border-border px-[1.4vw] py-[2.4vh]">
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Server
          </div>
          <div className="font-display font-bold text-[1.5vw] text-primary mt-[1vh] leading-tight">
            Backend Dev
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1.2vh]">
            Rp 18&ndash;30 jt/bln
          </div>
          <p className="text-[0.95vw] text-muted mt-[2vh] leading-snug">
            Node, Prisma, OpenAPI, JWT, kalkulasi finansial, audit log.
          </p>
        </div>

        <div className="bg-bg-elevated border border-border px-[1.4vw] py-[2.4vh]">
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Client
          </div>
          <div className="font-display font-bold text-[1.5vw] text-primary mt-[1vh] leading-tight">
            Frontend Dev
          </div>
          <div className="font-mono text-[0.85vw] text-muted mt-[1.2vh]">
            Rp 18&ndash;30 jt/bln
          </div>
          <p className="text-[0.95vw] text-muted mt-[2vh] leading-snug">
            React, Tailwind, React Query, Recharts, Gantt drag-n-drop custom.
          </p>
        </div>

        <div className="bg-primary text-bg px-[1.4vw] py-[2.4vh]">
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Bridge
          </div>
          <div className="font-display font-bold text-[1.5vw] mt-[1vh] leading-tight">
            Full-stack Dev
          </div>
          <div className="font-mono text-[0.85vw] opacity-80 mt-[1.2vh]">
            Rp 18&ndash;30 jt/bln
          </div>
          <p className="text-[0.95vw] opacity-85 mt-[2vh] leading-snug">
            Floater untuk integrasi, fitur cross-cutting, code review,
            deployment.
          </p>
        </div>
      </div>

      <div className="mt-[5vh] grid grid-cols-3 gap-[2vw] border-t border-border pt-[3vh]">
        <div>
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Total Person-Months
          </div>
          <div className="font-display font-bold text-[2.5vw] text-primary mt-[0.6vh]">
            22&ndash;28
          </div>
        </div>
        <div>
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Beban PM &amp; Dev
          </div>
          <div className="font-display font-bold text-[2.5vw] text-primary mt-[0.6vh]">
            Full-time 5 bulan
          </div>
        </div>
        <div>
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Beban System Analyst
          </div>
          <div className="font-display font-bold text-[2.5vw] text-primary mt-[0.6vh]">
            FT 2 bln + PT 3 bln
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[7vw] font-mono text-[0.9vw] text-muted tracking-widest">
        03 / 09
      </div>
    </div>
  );
}
