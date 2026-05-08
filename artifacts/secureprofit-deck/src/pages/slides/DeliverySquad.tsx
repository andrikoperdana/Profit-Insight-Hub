export default function DeliverySquad() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        04 / Delivery Squad
      </div>

      <div className="pt-[7vh] max-w-[72vw]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1] tracking-tight text-wrap-balance">
          The people who go
          <span className="text-primary"> directly into client projects.</span>
        </h2>
        <p className="mt-[2vh] text-[1.25vw] text-muted max-w-[60vw] leading-relaxed">
          Three field roles handle the technical work, reporting, and the
          day-to-day administrative support.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-3 gap-[1.6vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.6vw]">Consultant</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Security Consultant
          </div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            konsultan@secureprofit.id<br/>konsultan2@secureprofit.id
          </div>
          <div className="border-t border-border my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Run pentest, audit, or VA on assigned projects</li>
            <li>· Log daily timesheets (DRAFT → SUBMITTED) for PM approval</li>
            <li>· Work on PM-created tasks, clock in hours</li>
            <li>· Max. 2 active projects in parallel</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.6vw]">Technical Writer</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Reporting
          </div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            writer@secureprofit.id — Ayu Wulandari
          </div>
          <div className="border-t border-border my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Produce technical and executive reports from consultant findings</li>
            <li>· Log writing timesheets for PM approval</li>
            <li>· Upload draft REPORT &amp; OTHER documents to the project</li>
            <li>· Can work in parallel across many projects</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.6vw]">Project Admin</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Closing &amp; Invoice
          </div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            admin@secureprofit.id — Tono Setiawan
          </div>
          <div className="border-t border-border my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Organize closing docs once a project completes</li>
            <li>· Generate BAST &amp; INVOICE when the project finishes</li>
            <li>· Closing-doc inbox with alerts for &gt;3 days complete</li>
            <li>· Does not write code — focuses on documents &amp; circulation</li>
          </ul>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        04 / 10
      </div>
    </div>
  );
}
