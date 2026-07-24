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
          <ul className="text-[0.88vw] text-text leading-snug space-y-[0.55vh] mt-[1.4vh]">
            <li>· <span className="font-mono text-accent">Revenue = contractValue</span> — matches Total Contract Price</li>
            <li>· <span className="font-mono text-accent">Mandays × dailyRate</span> — Time-and-Materials costing</li>
            <li>· <span className="font-mono text-accent">Burn Rate</span> — proxy for PMI Schedule Performance</li>
            <li>· <span className="font-mono text-accent">EVM: CPI / SPI / EAC</span> vs the active baseline — PMBOK</li>
            <li>· <span className="font-mono text-accent">Recognised Revenue</span> = burn% × revenueNet — PSAK 72 §B18</li>
            <li>· <span className="font-mono text-accent">Accrued Cost</span> from SUBMITTED + APPROVED — accrual basis</li>
            <li>· <span className="font-mono text-accent">Net Margin</span> with overhead loader 1.8× — loaded rate</li>
            <li>· <span className="font-mono text-accent">Weighted Margin</span> = Σprofit / Σrevenue — true blended</li>
            <li>· <span className="font-mono text-accent">DPP / PPN</span> separated at intake — net basis throughout</li>
          </ul>
        </div>

        <div className="border border-neutral-500/40 bg-neutral-500/5 px-[1.6vw] py-[2vh]">
          <div className="font-mono text-[0.78vw] text-neutral-300 tracking-widest uppercase">Still simplified</div>
          <ul className="text-[0.88vw] text-text leading-snug space-y-[0.55vh] mt-[1.4vh]">
            <li>· One-off licenses fully expensed, <span className="text-neutral-100 font-semibold">no amortisation</span></li>
            <li>· Earned value uses manday burn, <span className="text-neutral-100 font-semibold">no milestone weighting</span></li>
            <li>· Payments tracked to milestone PAID (Xero) — <span className="text-neutral-100 font-semibold">no AR aging</span></li>
            <li>· No <span className="text-neutral-100 font-semibold">multi-currency</span> — IDR only</li>
            <li>· Overhead multiplier is <span className="text-neutral-100 font-semibold">flat 1.8×</span>, not per-cost-centre</li>
          </ul>
          <div className="mt-[1.4vh] pt-[1vh] border-t border-neutral-500/20 font-mono text-[0.74vw] text-neutral-400 tracking-widest uppercase">
            Reconcile against Accurate / SAP / Xero for statutory filings
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
