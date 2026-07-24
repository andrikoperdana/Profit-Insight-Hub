export default function Gates() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        07 / Readiness Gates
      </div>

      <div className="pt-[7vh] max-w-[76vw]">
        <h2 className="font-display font-bold text-[4vw] leading-[1] tracking-tight text-wrap-balance">
          No stage advances
          <span className="text-primary"> until the checklist passes.</span>
        </h2>
        <p className="mt-[2vh] text-[1.2vw] text-muted max-w-[62vw] leading-relaxed">
          The server validates every promotion and returns the exact list of
          what is still missing. The same rules apply to everyone — including
          Management.
        </p>
      </div>

      <div className="mt-[4.5vh] grid grid-cols-3 gap-[1.6vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Gate 1</div>
          <div className="font-display font-semibold text-[1.7vw] mt-[0.8vh]">&rarr; ACTIVE</div>
          <div className="border-t border-border my-[1.8vh]" />
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.55vh]">
            <li>&middot; Core overview fields complete &amp; PM assigned</li>
            <li>&middot; Contract value, mandays &amp; estimated cost &gt; 0</li>
            <li>&middot; At least one resource, one task, one RAID item</li>
            <li>&middot; Terms of Payment sum to exactly 100%</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Gate 2</div>
          <div className="font-display font-semibold text-[1.7vw] mt-[0.8vh]">&rarr; COMPLETE</div>
          <div className="border-t border-border my-[1.8vh]" />
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.55vh]">
            <li>&middot; Every task DONE, no pending timesheets</li>
            <li>&middot; No pending expenses or planned billing terms</li>
            <li>&middot; No open RAID items, signed BAST on file</li>
            <li>&middot; Auto: client survey issued + 360 pairs created</li>
          </ul>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.5vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Gate 3</div>
          <div className="font-display font-semibold text-[1.7vw] mt-[0.8vh]">&rarr; CLOSED</div>
          <div className="border-t border-primary/30 my-[1.8vh]" />
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.55vh]">
            <li>&middot; All 360 feedback submitted by the team</li>
            <li>&middot; Lessons-learned checklist note filled in</li>
            <li>&middot; Client satisfaction survey answered</li>
            <li>&middot; Checklist items need evidence: BAST, report, invoice</li>
          </ul>
        </div>
      </div>

      <div className="mt-[3.5vh] border-t border-border pt-[1.8vh] flex items-start gap-[1vw] max-w-[82vw]">
        <span className="font-mono text-primary text-[1vw] leading-none mt-[0.4vh]">i</span>
        <span className="text-[0.95vw] text-muted leading-snug">
          Change requests keep the gates honest: approved SCHEDULE or COST
          changes re-baseline the project, so later variance is measured
          against the agreed change — SCOPE changes are recorded for audit.
          Non-client projects (Internal, Presales, Training) skip the billing,
          BAST, and survey requirements.
        </span>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        07 / 17
      </div>
    </div>
  );
}
