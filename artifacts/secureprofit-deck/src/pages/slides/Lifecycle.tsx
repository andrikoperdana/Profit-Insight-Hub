export default function Lifecycle() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[8vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        04 / Lifecycle
      </div>

      <div className="pt-[8vh] max-w-[68vw]">
        <h2 className="font-display font-bold text-[4.8vw] leading-[1] tracking-tight text-wrap-balance">
          From RFP to revenue,
          <span className="text-primary"> one path.</span>
        </h2>
        <p className="mt-[2.5vh] text-[1.5vw] text-muted max-w-[60vw] leading-relaxed">
          Every project moves through gated stages with the right owner, the right
          documents, and the right alerts at each handoff.
        </p>
      </div>

      <div className="mt-[8vh] relative">
        <div className="absolute left-[2%] right-[2%] top-[4.2vh] h-[0.18vw] bg-border" />
        <div className="absolute left-[2%] top-[4.2vh] h-[0.18vw] bg-primary w-[68%]" />

        <div className="grid grid-cols-6 gap-[0.5vw] relative">
          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">
              01
            </div>
            <div className="font-display font-semibold text-[1.4vw] mt-[2.5vh]">
              RFP
            </div>
            <div className="text-[1vw] text-muted mt-[0.8vh] leading-snug">
              Sales captures opportunity, owner assigned
            </div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">
              02
            </div>
            <div className="font-display font-semibold text-[1.4vw] mt-[2.5vh]">
              Sales
            </div>
            <div className="text-[1vw] text-muted mt-[0.8vh] leading-snug">
              Scope, pricing, margin target locked
            </div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">
              03
            </div>
            <div className="font-display font-semibold text-[1.4vw] mt-[2.5vh]">
              Kickoff
            </div>
            <div className="text-[1vw] text-muted mt-[0.8vh] leading-snug">
              PM assigned, resources booked, plan baselined
            </div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">
              04
            </div>
            <div className="font-display font-semibold text-[1.4vw] mt-[2.5vh]">
              Active
            </div>
            <div className="text-[1vw] text-muted mt-[0.8vh] leading-snug">
              Hours flow in, P&amp;L updates daily
            </div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-bg-elevated border-[0.2vw] border-primary text-primary flex items-center justify-center font-mono font-bold text-[1vw] z-10">
              05
            </div>
            <div className="font-display font-semibold text-[1.4vw] mt-[2.5vh]">
              BAST
            </div>
            <div className="text-[1vw] text-muted mt-[0.8vh] leading-snug">
              Sign-off captured, evidence attached
            </div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-bg-elevated border-[0.2vw] border-border text-muted flex items-center justify-center font-mono font-bold text-[1vw] z-10">
              06
            </div>
            <div className="font-display font-semibold text-[1.4vw] mt-[2.5vh] text-muted">
              Invoice
            </div>
            <div className="text-[1vw] text-muted mt-[0.8vh] leading-snug">
              Auto-close handoff to finance
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        04 / 08
      </div>
    </div>
  );
}
