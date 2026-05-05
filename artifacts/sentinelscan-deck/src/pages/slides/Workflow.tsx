export default function Workflow() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-surface">
      <div className="h-full flex flex-col px-[8vw] py-[9vh]">
        <div className="mb-[6vh]">
          <p className="font-body text-accent text-[1.1vw] tracking-[0.3em] uppercase mb-[2vh]">
            04 — Workflow
          </p>
          <h2 className="font-display font-bold text-[4.4vw] leading-[1] tracking-tight text-text max-w-[70vw]">
            From kickoff to report in four steps.
          </h2>
        </div>

        <div className="flex-1 grid grid-cols-4 gap-[2vw] items-start">
          <div>
            <div className="flex items-center gap-[0.8vw] mb-[2.5vh]">
              <span className="font-display font-bold text-accent text-[1.4vw]">01</span>
              <span className="h-[1px] flex-1 bg-accent/40" />
            </div>
            <h3 className="font-display font-bold text-text text-[1.9vw] leading-tight mb-[1.5vh]">
              Define scope
            </h3>
            <p className="font-body text-muted text-[1.15vw] leading-relaxed">
              Register web targets, API base URLs, data classification,
              and rules of engagement.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-[0.8vw] mb-[2.5vh]">
              <span className="font-display font-bold text-accent text-[1.4vw]">02</span>
              <span className="h-[1px] flex-1 bg-accent/40" />
            </div>
            <h3 className="font-display font-bold text-text text-[1.9vw] leading-tight mb-[1.5vh]">
              Run the scan
            </h3>
            <p className="font-body text-muted text-[1.15vw] leading-relaxed">
              Seven engines run in parallel; progress and logs
              are available in real time on the dashboard.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-[0.8vw] mb-[2.5vh]">
              <span className="font-display font-bold text-accent text-[1.4vw]">03</span>
              <span className="h-[1px] flex-1 bg-accent/40" />
            </div>
            <h3 className="font-display font-bold text-text text-[1.9vw] leading-tight mb-[1.5vh]">
              Triage &amp; verify
            </h3>
            <p className="font-body text-muted text-[1.15vw] leading-relaxed">
              Pentesters add PoCs, change severity, or
              flag false positives from a single interface.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-[0.8vw] mb-[2.5vh]">
              <span className="font-display font-bold text-accent text-[1.4vw]">04</span>
              <span className="h-[1px] flex-1 bg-accent/40" />
            </div>
            <h3 className="font-display font-bold text-text text-[1.9vw] leading-tight mb-[1.5vh]">
              Deliver the report
            </h3>
            <p className="font-body text-muted text-[1.15vw] leading-relaxed">
              Generate a PDF complete with cover, executive summary,
              heatmap, and retest delta — fully version-trackable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
