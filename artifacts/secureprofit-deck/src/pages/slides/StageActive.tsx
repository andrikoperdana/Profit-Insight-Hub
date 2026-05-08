export default function StageActive() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        08 / Stage B — Execution
      </div>

      <div className="pt-[7vh] max-w-[74vw]">
        <h2 className="font-display font-bold text-[4vw] leading-[1] tracking-tight text-wrap-balance">
          Resourcing, execution,
          <span className="text-primary"> and profit calculated daily.</span>
        </h2>
        <p className="mt-[2vh] text-[1.2vw] text-muted max-w-[62vw] leading-relaxed">
          Once status moves OBSERVATION → ACTIVE, every field role runs in
          parallel. The PM remains the single approval point.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-12 gap-[1.5vw]">
        <div className="col-span-7 border border-border bg-bg-elevated/40 px-[1.8vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Resourcing</div>
          <div className="font-display font-semibold text-[1.6vw] mt-[0.6vh]">Team assembled by Principals &amp; PM</div>
          <div className="grid grid-cols-3 gap-[1vw] mt-[2vh]">
            <div>
              <div className="font-display font-semibold text-[1.1vw]">Principal Consultant</div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh] leading-snug">Click <span className="text-text">Propose Resource</span> on the Resources tab. PM clicks Accept.</div>
            </div>
            <div>
              <div className="font-display font-semibold text-[1.1vw]">Principal Tech Writer</div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh] leading-snug">Pick a writer from the Overview dropdown — assigned immediately.</div>
            </div>
            <div>
              <div className="font-display font-semibold text-[1.1vw]">Principal Project Admin</div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh] leading-snug">Pick an admin from the Overview dropdown — assigned immediately.</div>
            </div>
          </div>
        </div>

        <div className="col-span-5 border border-border bg-bg-elevated/40 px-[1.8vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Project Manager</div>
          <div className="font-display font-semibold text-[1.6vw] mt-[0.6vh]">Create daily tasks</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh] mt-[1.5vh]">
            <li>· "Tasks" tab → assign to consultant / writer</li>
            <li>· Status TODO → IN_PROGRESS → DONE</li>
            <li>· Log additional spend in the "Expenses" tab</li>
          </ul>
        </div>

        <div className="col-span-5 border border-border bg-bg-elevated/40 px-[1.8vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Consultant &amp; Writer</div>
          <div className="font-display font-semibold text-[1.6vw] mt-[0.6vh]">Log daily timesheet</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh] mt-[1.5vh]">
            <li>· "Log Today's Time Sheet" button on the dashboard</li>
            <li>· Status DRAFT → SUBMITTED for approval</li>
            <li>· Can clock in against a specific task</li>
          </ul>
        </div>

        <div className="col-span-7 border border-border bg-bg-elevated/40 px-[1.8vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Project Manager</div>
          <div className="font-display font-semibold text-[1.6vw] mt-[0.6vh]">Approve &amp; watch profit</div>
          <div className="grid grid-cols-2 gap-[1vw] mt-[1.5vh]">
            <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
              <li>· Approve / reject timesheets in the inbox</li>
              <li>· One-click "Approve All" for batch handling</li>
            </ul>
            <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
              <li>· "Financials" tab — margin updates in real time</li>
              <li>· Alert when actualCost approaches contractValue</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        08 / 10
      </div>
    </div>
  );
}
