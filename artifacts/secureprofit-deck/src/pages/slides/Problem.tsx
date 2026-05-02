export default function Problem() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[8vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        02 / Problem
      </div>

      <div className="grid grid-cols-12 gap-[2vw] h-full pt-[8vh]">
        <div className="col-span-5 flex flex-col justify-center pr-[2vw]">
          <h2 className="font-display font-bold text-[4.8vw] leading-[1] tracking-tight text-wrap-balance">
            Generic PSA tools
            <span className="block text-muted">miss the security beat.</span>
          </h2>
          <p className="mt-[3vh] text-[1.5vw] text-muted leading-relaxed">
            Pentests, audits, and compliance work run on tight margins and tighter
            deadlines. Spreadsheets and generic project tools quietly leak both.
          </p>
        </div>

        <div className="col-span-7 grid grid-cols-1 gap-[2vh] content-center">
          <div className="border border-border bg-bg-elevated/50 p-[3vh] flex gap-[2vw] items-start">
            <span className="font-mono text-[2vw] text-primary leading-none mt-[0.5vh]">
              01
            </span>
            <div>
              <div className="font-display font-semibold text-[1.7vw] mb-[0.8vh]">
                Profit visibility lags by weeks
              </div>
              <p className="text-[1.2vw] text-muted leading-snug">
                P&amp;L is pieced together from invoices, timesheets, and gut feel —
                long after a project has already burned its margin.
              </p>
            </div>
          </div>

          <div className="border border-border bg-bg-elevated/50 p-[3vh] flex gap-[2vw] items-start">
            <span className="font-mono text-[2vw] text-primary leading-none mt-[0.5vh]">
              02
            </span>
            <div>
              <div className="font-display font-semibold text-[1.7vw] mb-[0.8vh]">
                Consultants double-booked, then idle
              </div>
              <p className="text-[1.2vw] text-muted leading-snug">
                Without a real capacity view, the same senior gets stacked on three
                jobs while juniors sit on the bench.
              </p>
            </div>
          </div>

          <div className="border border-border bg-bg-elevated/50 p-[3vh] flex gap-[2vw] items-start">
            <span className="font-mono text-[2vw] text-primary leading-none mt-[0.5vh]">
              03
            </span>
            <div>
              <div className="font-display font-semibold text-[1.7vw] mb-[0.8vh]">
                BAST and invoicing slip past close
              </div>
              <p className="text-[1.2vw] text-muted leading-snug">
                Manual handoffs between PM, finance, and client mean projects stay
                "almost done" for months — and revenue waits with them.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        02 / 08
      </div>
    </div>
  );
}
