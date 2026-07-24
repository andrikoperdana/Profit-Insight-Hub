export default function HoursToMargin() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="relative h-full flex flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1vw] mb-[1.5vh]">
          <div className="w-[0.35vw] h-[3.2vh] bg-primary" />
          <span className="font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
            Data Flow: Hours to Margin
          </span>
        </div>
        <h2 className="font-display font-bold text-[3.2vw] tracking-tight leading-tight mb-[2vh]">
          Margin is derived, never hand-entered
        </h2>

        <div className="flex-1 flex flex-col justify-center gap-[6vh]">
        <div className="flex items-stretch gap-[0.9vw]">
          <div className="flex-1 border border-border bg-bg-elevated px-[1.2vw] py-[2.4vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              01
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight">
              Hours logged
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Consultants log time against a specific project task
            </div>
          </div>
          <div className="flex items-center font-display text-[1.7vw] text-primary">
            &rarr;
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.2vw] py-[2.4vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              02
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight">
              PM approval
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Submitted entries are approved or rejected by the project manager
            </div>
          </div>
          <div className="flex items-center font-display text-[1.7vw] text-primary">
            &rarr;
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.2vw] py-[2.4vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              03
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight">
              Resource cost
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Approved days priced at the rate valid on each work date
            </div>
          </div>
          <div className="flex items-center font-display text-[1.7vw] text-primary">
            &#43;
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.2vw] py-[2.4vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              04
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight">
              Expenses
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Approved expenses and settled cash advances added on top
            </div>
          </div>
          <div className="flex items-center font-display text-[1.7vw] text-primary">
            &rarr;
          </div>
          <div className="flex-1 border border-primary/60 bg-bg-elevated px-[1.2vw] py-[2.4vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              05
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight text-primary">
              Margin &amp; forecast
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Actual cost vs contract value, projected to completion
            </div>
          </div>
        </div>

        <div className="flex gap-[1.4vw]">
          <div className="flex-1 border border-border bg-bg-elevated px-[1.5vw] py-[2.4vh]">
            <div className="font-display font-bold text-[1.25vw] leading-tight">
              Only approved records count
            </div>
            <div className="text-[1vw] text-muted mt-[0.8vh] leading-snug">
              Draft and rejected entries never touch the financials, so margin
              always reflects reviewed work.
            </div>
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.5vw] py-[2.4vh]">
            <div className="font-display font-bold text-[1.25vw] leading-tight">
              One forecast engine
            </div>
            <div className="text-[1vw] text-muted mt-[0.8vh] leading-snug">
              Burn rate, profit outlook, health score, and earned value all
              derive from the same shared computation.
            </div>
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.5vw] py-[2.4vh]">
            <div className="font-display font-bold text-[1.25vw] leading-tight">
              Rate history preserved
            </div>
            <div className="text-[1vw] text-muted mt-[0.8vh] leading-snug">
              Rate changes apply from their effective date — past work is never
              silently repriced.
            </div>
          </div>
        </div>
        </div>

        <div className="border-t border-border pt-[2vh] flex items-center justify-end">
          <div className="font-mono text-[0.9vw] text-muted tracking-widest">
            08 / 10
          </div>
        </div>
      </div>
    </div>
  );
}
