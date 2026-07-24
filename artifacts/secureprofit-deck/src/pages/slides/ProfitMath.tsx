export default function ProfitMath() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        How profit is calculated
      </div>

      <div className="pt-[7vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.8vw] leading-[1] tracking-tight">
          Three KPIs,
          <span className="text-primary"> one source of truth.</span>
        </h2>
        <p className="mt-[1.8vh] text-[1.15vw] text-muted max-w-[64vw] leading-relaxed">
          Every dashboard tile rolls up from project-level math computed
          server-side by one shared engine — only approved timesheets and
          approved expenses count.
        </p>
      </div>

      <div className="mt-[4.5vh] grid grid-cols-3 gap-[1.4vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.6vw] py-[2.2vh]">
          <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">Total Revenue</div>
          <div className="font-display font-semibold text-[1.5vw] mt-[0.6vh] leading-tight">
            Sum of contract value
          </div>
          <div className="font-mono text-[0.95vw] text-accent mt-[1.6vh] leading-snug">
            Σ project.contractValue
          </div>
          <p className="text-[0.92vw] text-muted mt-[1.4vh] leading-relaxed">
            All your projects, every status (DRAFT → CLOSED). Gross commercial
            book — not cash collected.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.6vw] py-[2.2vh]">
          <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">Pipeline Value</div>
          <div className="font-display font-semibold text-[1.5vw] mt-[0.6vh] leading-tight">
            Active + Observation only
          </div>
          <div className="font-mono text-[0.95vw] text-accent mt-[1.6vh] leading-snug">
            Σ contractValue WHERE status IN (ACTIVE, OBSERVATION)
          </div>
          <p className="text-[0.92vw] text-muted mt-[1.4vh] leading-relaxed">
            What's still in flight. Drafts, completed, and closed projects are
            excluded.
          </p>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.6vw] py-[2.2vh]">
          <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">Average Margin</div>
          <div className="font-display font-semibold text-[1.5vw] mt-[0.6vh] leading-tight">
            Profit so far / revenue
          </div>
          <div className="font-mono text-[0.95vw] text-accent mt-[1.6vh] leading-snug">
            avg( actualProfit / contractValue × 100 )
          </div>
          <p className="text-[0.92vw] text-muted mt-[1.4vh] leading-relaxed">
            Simple per-project average. Starts near 100% and drops as approved
            timesheets and expenses accrue.
          </p>
        </div>
      </div>

      <div className="mt-[4vh] border border-border bg-bg-elevated/40 px-[2vw] py-[2.4vh]">
        <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">
          Per-project formula — computeMetrics()
        </div>
        <div className="grid grid-cols-4 gap-[1.4vw] mt-[1.6vh]">
          <div>
            <div className="font-mono text-[0.85vw] text-accent">resourceCost</div>
            <div className="text-[0.88vw] text-muted mt-[0.4vh] leading-snug">
              Σ (hours / 8) × rate effective on the work date · APPROVED only
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.85vw] text-accent">additionalCost</div>
            <div className="text-[0.88vw] text-muted mt-[0.4vh] leading-snug">
              Σ APPROVED expenses · settled cash advances count at settlement
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.85vw] text-accent">actualProfit</div>
            <div className="text-[0.88vw] text-muted mt-[0.4vh] leading-snug">
              contractValue − (resourceCost + additionalCost)
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.85vw] text-accent">marginPct</div>
            <div className="text-[0.88vw] text-muted mt-[0.4vh] leading-snug">
              actualProfit / contractValue × 100
            </div>
          </div>
        </div>
      </div>

      <div className="mt-[2.5vh] flex items-start gap-[1vw] text-[0.92vw] text-muted leading-relaxed max-w-[80vw]">
        <span className="font-mono text-primary tracking-widest text-[0.78vw] uppercase mt-[0.2vh]">Note</span>
        <p>
          Estimated Cost (set by PM at planning) is <span className="text-text">not</span> part of actualCost — it
          drives <span className="text-text">estimatedProfit</span> on the Financials tab. New projects therefore
          show very high margin until consultants log time and the PM approves it.
        </p>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        Margin Math
      </div>
    </div>
  );
}
