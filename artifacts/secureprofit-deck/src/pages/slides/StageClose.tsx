export default function StageClose() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        15 / Stage C — Closing &amp; CSAT
      </div>

      <div className="pt-[7vh] max-w-[74vw]">
        <h2 className="font-display font-bold text-[4vw] leading-[1] tracking-tight text-wrap-balance">
          BAST, invoice, and
          <span className="text-primary"> the automatic satisfaction survey.</span>
        </h2>
        <p className="mt-[2vh] text-[1.2vw] text-muted max-w-[62vw] leading-relaxed">
          Once every deliverable is done and the closing gate passes, the PM
          moves the status to COMPLETE — the survey and 360 feedback go out
          automatically, no manual click required.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-4 gap-[1.4vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.4vh]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[0.95vw]">01</div>
          <div className="font-display font-semibold text-[1.4vw] mt-[1.5vh]">Admin preps the docs</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.5vh]">Project Admin</div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            BAST &amp; INVOICE go into the Documents tab — a signed BAST is
            required before the project can complete.
          </div>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.4vh]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[0.95vw]">02</div>
          <div className="font-display font-semibold text-[1.4vw] mt-[1.5vh]">PM completes the project</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.5vh]">Project Manager</div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            All tasks done, no pending timesheets or expenses, billing terms
            settled — status moves to COMPLETE.
          </div>
        </div>

        <div className="border border-primary/40 bg-primary/10 px-[1.4vw] py-[2.4vh]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[0.95vw]">03</div>
          <div className="font-display font-semibold text-[1.4vw] mt-[1.5vh]">Survey &amp; 360 auto-issued</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.5vh]">System</div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            On COMPLETE, the client survey link goes out and 360 feedback pairs
            are created for the whole delivery team.
          </div>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.4vh]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[0.95vw]">04</div>
          <div className="font-display font-semibold text-[1.4vw] mt-[1.5vh]">PM sets CLOSED</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.5vh]">Project Manager</div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            Unlocks once 360s are in, lessons learned are filled, and the
            survey is answered — then the project is locked.
          </div>
        </div>
      </div>

      <div className="mt-[4vh] grid grid-cols-2 gap-[2vw]">
        <div className="border-l-[0.25vw] border-primary pl-[1.5vw]">
          <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.6vh]">
            Audit log
          </div>
          <div className="text-[1.05vw] text-text leading-snug">
            Every transition is recorded — who changed it, when, and the values
            before &amp; after. The Site Admin has full access for investigations.
          </div>
        </div>
        <div className="border-l-[0.25vw] border-primary pl-[1.5vw]">
          <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.6vh]">
            CSAT score
          </div>
          <div className="text-[1.05vw] text-text leading-snug">
            Survey results are tied to the project ID, so the PMO can compare
            client satisfaction by PM, by service line, or by principal.
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        15 / 17
      </div>
    </div>
  );
}
