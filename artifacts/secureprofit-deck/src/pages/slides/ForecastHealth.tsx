export default function ForecastHealth() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        14 / Financial Intelligence
      </div>

      <div className="pt-[7vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.8vw] leading-[1] tracking-tight text-wrap-balance">
          Every project projected,
          <span className="text-primary"> scored, and measured.</span>
        </h2>
        <p className="mt-[1.8vh] text-[1.15vw] text-muted max-w-[64vw] leading-relaxed">
          Beyond the live P&amp;L, each project carries a forward-looking
          outlook, a health score, and earned-value metrics — all from one
          shared forecasting engine.
        </p>
      </div>

      <div className="mt-[4vh] grid grid-cols-3 gap-[1.5vw]">
        <div className="border border-primary/40 bg-primary/5 px-[1.6vw] py-[2.2vh]">
          <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">Profit Outlook</div>
          <div className="font-display font-semibold text-[1.45vw] mt-[0.6vh] leading-tight">
            Initial &rarr; Actual &rarr; Projected
          </div>
          <p className="text-[0.92vw] text-muted mt-[1.2vh] leading-relaxed">
            The intake estimate, the margin realised so far, and where the
            project lands at completion — side by side.
          </p>
          <div className="flex flex-wrap gap-[0.5vw] mt-[1.6vh]">
            <span className="font-mono text-[0.72vw] tracking-widest uppercase border border-border px-[0.6vw] py-[0.5vh] text-muted">Early</span>
            <span className="font-mono text-[0.72vw] tracking-widest uppercase border border-primary/50 px-[0.6vw] py-[0.5vh] text-primary">Profit</span>
            <span className="font-mono text-[0.72vw] tracking-widest uppercase border border-amber-500/50 px-[0.6vw] py-[0.5vh] text-amber-400">Thin</span>
            <span className="font-mono text-[0.72vw] tracking-widest uppercase border border-red-500/50 px-[0.6vw] py-[0.5vh] text-red-400">Loss risk</span>
          </div>
          <p className="text-[0.85vw] text-muted mt-[1.4vh] leading-snug">
            Before any hours are approved, the outlook falls back to the intake
            estimate instead of guessing from zero.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.6vw] py-[2.2vh]">
          <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">Health Score</div>
          <div className="font-display font-semibold text-[1.45vw] mt-[0.6vh] leading-tight">
            0&ndash;100, five signals
          </div>
          <ul className="text-[0.92vw] text-text leading-relaxed space-y-[0.55vh] mt-[1.2vh]">
            <li>&middot; Margin erosion vs the plan</li>
            <li>&middot; Open RAID items, weighted by impact</li>
            <li>&middot; Expenses stuck in approval</li>
            <li>&middot; Billing milestones past due</li>
            <li>&middot; Days past the planned end date</li>
          </ul>
          <p className="text-[0.85vw] text-muted mt-[1.4vh] leading-snug">
            Feeds the at-risk lists on the Management dashboard, so attention
            goes where the score drops.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.6vw] py-[2.2vh]">
          <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">Earned Value</div>
          <div className="font-display font-semibold text-[1.45vw] mt-[0.6vh] leading-tight">
            CPI &middot; SPI &middot; EAC vs baseline
          </div>
          <ul className="text-[0.92vw] text-text leading-relaxed space-y-[0.55vh] mt-[1.2vh]">
            <li>&middot; Baseline captured when the project goes ACTIVE</li>
            <li>&middot; <span className="font-mono text-accent">CPI &gt; 1</span> — delivering under budget</li>
            <li>&middot; <span className="font-mono text-accent">SPI &gt; 1</span> — ahead of schedule</li>
            <li>&middot; <span className="font-mono text-accent">EAC</span> — projected final cost at completion</li>
          </ul>
          <p className="text-[0.85vw] text-muted mt-[1.4vh] leading-snug">
            Approved schedule and cost change requests re-baseline the
            project, so variance is always measured against the agreed plan.
          </p>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        14 / 17
      </div>
    </div>
  );
}
