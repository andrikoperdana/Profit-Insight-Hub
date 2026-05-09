export default function StandardsCheck() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        Standards check
      </div>

      <div className="pt-[7vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.4vw] leading-[1] tracking-tight">
          Operational dashboard,
          <span className="text-primary"> not a statutory ledger.</span>
        </h2>
        <p className="mt-[1.4vh] text-[1.05vw] text-muted max-w-[64vw] leading-relaxed">
          The math follows industry practice for professional-services tracking. It is not a substitute for ASC 606 / PSAK 72 revenue recognition or audited financials.
        </p>
      </div>

      <div className="mt-[3.5vh] grid grid-cols-2 gap-[1.5vw]">
        <div className="border border-primary/40 bg-primary/5 px-[1.6vw] py-[2vh]">
          <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">Aligned with standard</div>
          <ul className="text-[0.92vw] text-text leading-snug space-y-[0.7vh] mt-[1.4vh]">
            <li>· <span className="font-mono text-accent">Revenue = contractValue</span> — matches Total Contract Price</li>
            <li>· <span className="font-mono text-accent">Mandays × dailyRate</span> — Time-and-Materials costing</li>
            <li>· <span className="font-mono text-accent">Margin %</span> — standard Gross Margin formula</li>
            <li>· <span className="font-mono text-accent">Burn Rate</span> — proxy for PMI Schedule Performance</li>
            <li>· <span className="font-mono text-accent">Forecast linear</span> — EAC formula 1 (PMBOK)</li>
          </ul>
        </div>

        <div className="border border-amber-500/40 bg-amber-500/5 px-[1.6vw] py-[2vh]">
          <div className="font-mono text-[0.78vw] text-amber-400 tracking-widest uppercase">Simplified vs standard</div>
          <ul className="text-[0.92vw] text-text leading-snug space-y-[0.7vh] mt-[1.4vh]">
            <li>· Revenue recognised <span className="text-amber-300">in full on day-1</span>, not over-time</li>
            <li>· Cost <span className="text-amber-300">excludes SUBMITTED</span> timesheets (no accrual)</li>
            <li>· <span className="text-amber-300">Gross margin only</span> — no overhead / loaded rate</li>
            <li>· No PPN / DPP separation in <span className="font-mono text-accent">contractValue</span></li>
            <li>· Average Margin = simple avg, <span className="text-amber-300">not weighted</span></li>
            <li>· One-off licenses fully expensed, <span className="text-amber-300">no amortisation</span></li>
          </ul>
        </div>
      </div>

      <div className="mt-[3vh] border border-border bg-bg-elevated/40 px-[1.8vw] py-[2vh]">
        <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">Roadmap to closer compliance</div>
        <div className="grid grid-cols-3 gap-[1.4vw] mt-[1.4vh]">
          <div>
            <div className="font-mono text-[0.78vw] text-primary">High priority</div>
            <ul className="text-[0.85vw] text-text leading-snug space-y-[0.4vh] mt-[0.6vh]">
              <li>· Weighted average margin KPI</li>
              <li>· Net margin via overhead loader</li>
            </ul>
          </div>
          <div>
            <div className="font-mono text-[0.78vw] text-accent">Medium priority</div>
            <ul className="text-[0.85vw] text-text leading-snug space-y-[0.4vh] mt-[0.6vh]">
              <li>· Recognised revenue = burn% × CV</li>
              <li>· Accrued cost from SUBMITTED</li>
            </ul>
          </div>
          <div>
            <div className="font-mono text-[0.78vw] text-muted">Low priority</div>
            <ul className="text-[0.85vw] text-text leading-snug space-y-[0.4vh] mt-[0.6vh]">
              <li>· DPP / PPN field on intake</li>
              <li>· EAC composite forecast option</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-[2.5vh] flex items-start gap-[1vw] text-[0.88vw] text-muted leading-relaxed max-w-[80vw]">
        <span className="font-mono text-primary tracking-widest text-[0.74vw] uppercase mt-[0.2vh]">Bottom line</span>
        <p>
          Use SecureProfit Hub as the operational source of truth for project profitability. For audit, GL posting, and tax filings, reconcile against your accounting system (Accurate, SAP, Xero, etc.) — these numbers are <span className="text-text">management figures</span>, not statutory ones.
        </p>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        Standards Check
      </div>
    </div>
  );
}
