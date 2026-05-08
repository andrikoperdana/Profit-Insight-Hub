export default function StageIntake() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        07 / Stage A — Intake
      </div>

      <div className="pt-[7vh] max-w-[74vw]">
        <h2 className="font-display font-bold text-[4vw] leading-[1] tracking-tight text-wrap-balance">
          Sales drafts, PMO assigns the PM,
          <span className="text-primary"> PM completes the details.</span>
        </h2>
        <p className="mt-[2vh] text-[1.2vw] text-muted max-w-[62vw] leading-relaxed">
          The three early hand-offs that decide whether a project can move to
          execution or stays stuck in the pipeline.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-3 gap-[1.6vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh] relative">
          <div className="absolute top-[2vh] right-[1.5vw] font-mono text-[0.8vw] text-primary">→</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Step 1 · Sales</div>
          <div className="font-display font-semibold text-[1.7vw] mt-[1vh]">Create DRAFT</div>
          <div className="text-[1vw] text-muted mt-[1.5vh] leading-relaxed">
            Page <span className="font-mono text-text">/projects/new</span>:
            fill 4 fields — Name, SPK, Client, Contract Value. Click save.
          </div>
          <div className="border-t border-border my-[2vh]" />
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mb-[1vh]">Result</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
            <li>· Project status: DRAFT</li>
            <li>· Sales becomes the owner (salesId)</li>
            <li>· PM still empty</li>
            <li>· Appears on the PMO dashboard</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh] relative">
          <div className="absolute top-[2vh] right-[1.5vw] font-mono text-[0.8vw] text-primary">→</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Step 2 · PMO Director</div>
          <div className="font-display font-semibold text-[1.7vw] mt-[1vh]">Assign the PM</div>
          <div className="text-[1vw] text-muted mt-[1.5vh] leading-relaxed">
            Purple "Pending PM Assignment" card on the dashboard. Click
            <span className="font-mono text-text"> Assign PM</span>, pick a name
            from the dropdown, save.
          </div>
          <div className="border-t border-border my-[2vh]" />
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mb-[1vh]">Result</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
            <li>· pmId is set</li>
            <li>· Project moves into the PM inbox</li>
            <li>· Audit log: project.pm_assigned</li>
            <li>· Status remains DRAFT</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Step 3 · Project Manager</div>
          <div className="font-display font-semibold text-[1.7vw] mt-[1vh]">Complete the details</div>
          <div className="text-[1vw] text-muted mt-[1.5vh] leading-relaxed">
            Open the project → "DraftCompletionCard" purple card on top. Fill in
            description, schedule, revenue, planned mandays, estimated cost.
          </div>
          <div className="border-t border-border my-[2vh]" />
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mb-[1vh]">Result</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
            <li>· Status moves to OBSERVATION</li>
            <li>· Delivery team starts to be invited</li>
            <li>· Financial dashboard becomes active</li>
            <li>· Ready for the resourcing phase</li>
          </ul>
        </div>
      </div>

      <div className="mt-[3vh] border-t border-border pt-[1.6vh] flex items-start gap-[1vw] max-w-[80vw]">
        <span className="font-mono text-primary text-[1vw] leading-none mt-[0.4vh]">i</span>
        <span className="text-[0.95vw] text-muted leading-snug">
          Tip — a new project may not have an SPK / PO Number yet at intake.
          Sales can save the draft with the SPK field empty and fill it in
          later once the client has issued the document.
        </span>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        07 / 10
      </div>
    </div>
  );
}
