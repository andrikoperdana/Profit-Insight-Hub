export default function ProjectFinancials() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        Project · Financials tab
      </div>

      <div className="pt-[7vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.6vw] leading-[1] tracking-tight">
          Seven tiles,
          <span className="text-primary"> one live P&amp;L per project.</span>
        </h2>
        <p className="mt-[1.6vh] text-[1.1vw] text-muted max-w-[64vw] leading-relaxed">
          Computed from approved timesheets and approved expenses — with Profit
          Outlook, Health Score, and earned value right below the tiles.
        </p>
      </div>

      <div className="mt-[3.5vh] grid grid-cols-4 gap-[1.1vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh]">
          <div className="font-mono text-[0.72vw] text-primary tracking-widest uppercase">1 · Revenue</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh] leading-tight">Selling price to client</div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh]">project.contractValue</div>
          <p className="text-[0.82vw] text-muted mt-[0.8vh] leading-snug">Constant. Set by Sales, editable by PM/Mgmt on Overview.</p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh]">
          <div className="font-mono text-[0.72vw] text-primary tracking-widest uppercase">2 · Estimated Cost</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh] leading-tight">Planned operational cost</div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh]">project.estimatedCost</div>
          <p className="text-[0.82vw] text-muted mt-[0.8vh] leading-snug">Plan only — does not feed Actual Cost or Profit.</p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh]">
          <div className="font-mono text-[0.72vw] text-primary tracking-widest uppercase">3 · Actual Cost</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh] leading-tight">Cost incurred so far</div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh]">resourceCost + additionalCost</div>
          <p className="text-[0.82vw] text-muted mt-[0.8vh] leading-snug">Approved timesheets × dailyRate + expense rows.</p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh]">
          <div className="font-mono text-[0.72vw] text-primary tracking-widest uppercase">4 · Actual Profit / Loss</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh] leading-tight">Realised margin to date</div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh]">contractValue − actualCost</div>
          <p className="text-[0.82vw] text-muted mt-[0.8vh] leading-snug">Tile turns red the moment value goes negative.</p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh]">
          <div className="font-mono text-[0.72vw] text-primary tracking-widest uppercase">5 · Forecasted Final Profit</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh] leading-tight">Linear projection to end</div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh]">cv − (projMandays × avgRate + addCost)</div>
          <p className="text-[0.82vw] text-muted mt-[0.8vh] leading-snug">Extrapolates current burn rate; one-off expenses not scaled.</p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh]">
          <div className="font-mono text-[0.72vw] text-primary tracking-widest uppercase">6 · Burn Rate</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh] leading-tight">Mandays consumed</div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh]">actualMandays / plannedMandays × 100</div>
          <p className="text-[0.82vw] text-muted mt-[0.8vh] leading-snug">Progress bar caps at 100% — overshoot signals over-run.</p>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.2vw] py-[1.8vh]">
          <div className="font-mono text-[0.72vw] text-primary tracking-widest uppercase">7 · Profit Margin</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh] leading-tight">Headline KPI</div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh]">actualProfit / contractValue × 100</div>
          <p className="text-[0.82vw] text-muted mt-[0.8vh] leading-snug">Same math as tile 4, surfaced as the at-a-glance percentage.</p>
        </div>

        <div className="border border-border bg-bg-elevated/20 px-[1.2vw] py-[1.8vh]">
          <div className="font-mono text-[0.72vw] text-muted tracking-widest uppercase">Three lenses</div>
          <ul className="text-[0.82vw] text-text leading-snug space-y-[0.5vh] mt-[1vh]">
            <li><span className="text-accent font-mono">Estimated</span> — the plan</li>
            <li><span className="text-accent font-mono">Actual</span> — what happened</li>
            <li><span className="text-accent font-mono">Forecast</span> — where it lands</li>
          </ul>
        </div>
      </div>

      <div className="mt-[3vh] flex items-start gap-[1vw] text-[0.88vw] text-muted leading-relaxed max-w-[80vw]">
        <span className="font-mono text-primary tracking-widest text-[0.74vw] uppercase mt-[0.2vh]">Why margin starts near 100%</span>
        <p>
          A new project shows ~99% margin until consultants log time and the PM approves it.
          Only <span className="text-text">APPROVED</span> timesheets count toward Actual Cost — DRAFT, SUBMITTED, and REJECTED are excluded by design.
        </p>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        Project P&amp;L
      </div>
    </div>
  );
}
