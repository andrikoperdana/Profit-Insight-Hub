export default function Profitability() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[8vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        05 / Profitability
      </div>

      <div className="grid grid-cols-12 gap-[3vw] h-full pt-[8vh]">
        <div className="col-span-6 flex flex-col justify-center">
          <h2 className="font-display font-bold text-[4.6vw] leading-[1] tracking-tight text-wrap-balance">
            Margin you can see
            <span className="block text-primary">before it disappears.</span>
          </h2>
          <p className="mt-[3vh] text-[1.4vw] text-muted leading-relaxed">
            Every approved timesheet recomputes burn, forecast, and projected margin
            in real time. Losing projects light up before the bleed turns into a
            quarter-end surprise.
          </p>
          <div className="mt-[4vh] flex items-center gap-[1vw] text-[1.1vw] text-muted">
            <span className="font-mono text-primary">→</span>
            <span>Threshold alerts route to PM and Management</span>
          </div>
          <div className="mt-[1.2vh] flex items-center gap-[1vw] text-[1.1vw] text-muted">
            <span className="font-mono text-primary">→</span>
            <span>Forecast vs. plan side-by-side at every stage</span>
          </div>
        </div>

        <div className="col-span-6 flex flex-col justify-center">
          <div className="border border-border bg-bg-elevated/60 p-[3vh]">
            <div className="font-mono text-[0.85vw] text-muted tracking-widest uppercase">
              Live Margin
            </div>
            <div className="flex items-baseline gap-[1vw] mt-[1vh]">
              <div className="font-display font-bold text-[7vw] text-primary leading-none">
                32.4%
              </div>
              <div className="font-mono text-[1vw] text-primary">+2.1 pts</div>
            </div>
            <div className="text-[1vw] text-muted mt-[1vh]">
              Portfolio average · last 30 days
            </div>
          </div>

          <div className="grid grid-cols-2 gap-[1.2vw] mt-[2vh]">
            <div className="border border-border bg-bg-elevated/40 p-[2.5vh]">
              <div className="font-mono text-[0.8vw] text-muted tracking-widest uppercase mb-[1vh]">
                Burn vs. Plan
              </div>
              <div className="font-display font-bold text-[2.6vw] text-text leading-none">
                94%
              </div>
              <div className="text-[0.95vw] text-muted mt-[0.8vh]">
                On track across active jobs
              </div>
            </div>
            <div className="border border-border bg-bg-elevated/40 p-[2.5vh]">
              <div className="font-mono text-[0.8vw] text-muted tracking-widest uppercase mb-[1vh]">
                At-risk projects
              </div>
              <div className="font-display font-bold text-[2.6vw] text-text leading-none">
                3
              </div>
              <div className="text-[0.95vw] text-muted mt-[0.8vh]">
                Margin under 15% threshold
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        05 / 08
      </div>
    </div>
  );
}
