export default function Platform() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[8vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        03 / Platform
      </div>

      <div className="pt-[8vh] max-w-[70vw]">
        <h2 className="font-display font-bold text-[4.8vw] leading-[1] tracking-tight text-wrap-balance">
          One workspace for the
          <span className="text-primary"> whole engagement.</span>
        </h2>
        <p className="mt-[2.5vh] text-[1.5vw] text-muted max-w-[55vw] leading-relaxed">
          Sales, delivery, finance, and management all work from the same source of
          truth — from the first RFP to the closed-out invoice.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-[1.5vw] mt-[6vh]">
        <div className="border border-border bg-bg-elevated/40 p-[2.5vh]">
          <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[1.5vh]">
            Module 01
          </div>
          <div className="font-display font-semibold text-[1.5vw] leading-tight mb-[1.2vh]">
            Project lifecycle
          </div>
          <p className="text-[1.05vw] text-muted leading-snug">
            RFP, sales, kickoff, delivery, BAST, invoice — every stage tracked with
            owners and gates.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 p-[2.5vh]">
          <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[1.5vh]">
            Module 02
          </div>
          <div className="font-display font-semibold text-[1.5vw] leading-tight mb-[1.2vh]">
            Time &amp; approvals
          </div>
          <p className="text-[1.05vw] text-muted leading-snug">
            Daily timesheets with one-tap approvals for PMs, audited end-to-end.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 p-[2.5vh]">
          <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[1.5vh]">
            Module 03
          </div>
          <div className="font-display font-semibold text-[1.5vw] leading-tight mb-[1.2vh]">
            Real-time P&amp;L
          </div>
          <p className="text-[1.05vw] text-muted leading-snug">
            Burn vs. plan, margin alerts, and forecasting computed the moment hours
            land.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 p-[2.5vh]">
          <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[1.5vh]">
            Module 04
          </div>
          <div className="font-display font-semibold text-[1.5vw] leading-tight mb-[1.2vh]">
            People &amp; capacity
          </div>
          <p className="text-[1.05vw] text-muted leading-snug">
            Utilization, skills, and bench view across the whole consulting team.
          </p>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        03 / 08
      </div>
    </div>
  );
}
