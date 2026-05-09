export default function FinanceUpgrade() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        Finance upgrade · v2
      </div>

      <div className="pt-[7vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.4vw] leading-[1] tracking-tight">
          Closer to PSAK 72,
          <span className="text-primary"> still live every request.</span>
        </h2>
        <p className="mt-[1.4vh] text-[1.05vw] text-muted max-w-[64vw] leading-relaxed">
          Five accounting upgrades shipped to the serializer and the dashboards — no schema rewrites, no nightly batch. Old projects keep working; new fields default safely.
        </p>
      </div>

      <div className="mt-[3.5vh] grid grid-cols-3 gap-[1.2vw]">
        <div className="border border-primary/40 bg-primary/5 px-[1.4vw] py-[1.9vh]">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[0.74vw] text-primary tracking-widest uppercase">1 · Weighted Margin</div>
            <div className="font-mono text-[0.7vw] text-primary/70">KPI</div>
          </div>
          <div className="font-display font-semibold text-[1.2vw] mt-[0.6vh] leading-tight">
            Revenue-weighted, not simple avg
          </div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh] leading-snug">
            Σ profit / Σ contractValue × 100
          </div>
          <p className="text-[0.85vw] text-muted mt-[0.9vh] leading-snug">
            Big projects now move the dial; a 80% margin on a Rp 5jt project no longer hides a 5% margin on Rp 5M.
          </p>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.4vw] py-[1.9vh]">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[0.74vw] text-primary tracking-widest uppercase">2 · Net Margin</div>
            <div className="font-mono text-[0.7vw] text-primary/70">Loaded</div>
          </div>
          <div className="font-display font-semibold text-[1.2vw] mt-[0.6vh] leading-tight">
            Overhead loader 1.8×
          </div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh] leading-snug">
            loadedResourceCost = resourceCost × 1.8
          </div>
          <p className="text-[0.85vw] text-muted mt-[0.9vh] leading-snug">
            Bench, training, tools, office. Net margin = (rev − loaded − addCost) / rev. Multiplier configurable per environment.
          </p>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.4vw] py-[1.9vh]">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[0.74vw] text-primary tracking-widest uppercase">3 · Recognised Revenue</div>
            <div className="font-mono text-[0.7vw] text-primary/70">PSAK 72</div>
          </div>
          <div className="font-display font-semibold text-[1.2vw] mt-[0.6vh] leading-tight">
            Burn % of contract value
          </div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh] leading-snug">
            min(actualMandays / planned, 1) × revenueNet
          </div>
          <p className="text-[0.85vw] text-muted mt-[0.9vh] leading-snug">
            Over-time recognition by input method. No longer 100% on day-1 — matches IFRS 15 / PSAK 72 §B18.
          </p>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.4vw] py-[1.9vh]">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[0.74vw] text-primary tracking-widest uppercase">4 · Accrued Cost</div>
            <div className="font-mono text-[0.7vw] text-primary/70">Accrual</div>
          </div>
          <div className="font-display font-semibold text-[1.2vw] mt-[0.6vh] leading-tight">
            SUBMITTED + APPROVED
          </div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh] leading-snug">
            accruedCost = Σ (h/8 × rate) WHERE status ∈ (S, A)
          </div>
          <p className="text-[0.85vw] text-muted mt-[0.9vh] leading-snug">
            PM-pending hours stop hiding under the rug. Actual Cost still uses APPROVED only — accrued shows what's coming.
          </p>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.4vw] py-[1.9vh]">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[0.74vw] text-primary tracking-widest uppercase">5 · DPP / PPN</div>
            <div className="font-mono text-[0.7vw] text-primary/70">Tax</div>
          </div>
          <div className="font-display font-semibold text-[1.2vw] mt-[0.6vh] leading-tight">
            Net revenue, not gross
          </div>
          <div className="font-mono text-[0.82vw] text-accent mt-[1vh] leading-snug">
            revenueNet = cv / (1 + vat%) · vatAmount = cv − net
          </div>
          <p className="text-[0.85vw] text-muted mt-[0.9vh] leading-snug">
            Sales picks "includes PPN" or "excludes PPN" at intake. Default 11%. All margin math now runs on net (DPP).
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/20 px-[1.4vw] py-[1.9vh]">
          <div className="font-mono text-[0.74vw] text-muted tracking-widest uppercase">Where it shows up</div>
          <ul className="text-[0.85vw] text-text leading-snug space-y-[0.55vh] mt-[1vh]">
            <li>· Project Financials — 4 new tiles</li>
            <li>· Management dashboard — Net Margin KPI</li>
            <li>· Profitability trend — net basis</li>
            <li>· Project Overview — strict PPN validation</li>
            <li>· Sales intake — DPP / PPN toggle</li>
          </ul>
        </div>
      </div>

      <div className="mt-[3vh] border border-border bg-bg-elevated/40 px-[1.8vw] py-[1.8vh]">
        <div className="font-mono text-[0.78vw] text-primary tracking-widest uppercase">Backwards compatibility</div>
        <div className="grid grid-cols-3 gap-[1.4vw] mt-[1vh] text-[0.88vw] text-muted leading-snug">
          <div>
            <span className="font-mono text-accent">vatPercent</span> defaults to 11 on existing rows; old projects flow through net = gross / 1.11 with no migration.
          </div>
          <div>
            Old <span className="font-mono text-accent">marginPct</span> still served for historical comparison; new <span className="font-mono text-accent">netMarginPct</span> is the headline going forward.
          </div>
          <div>
            <span className="font-mono text-accent">OVERHEAD_MULTIPLIER</span> read from env at boot — set to 1.0 to disable loading and revert to gross math.
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        Finance v2
      </div>
    </div>
  );
}
