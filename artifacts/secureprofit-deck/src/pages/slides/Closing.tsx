export default function Closing() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-elevated" />
      <div className="absolute -top-[20vh] -right-[20vw] w-[60vw] h-[60vw] rounded-full bg-primary/10 blur-[8vw]" />

      <div className="relative h-full flex flex-col justify-between px-[8vw] py-[8vh]">
        <div className="flex items-center gap-[1.2vw]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-md bg-primary flex items-center justify-center">
            <div className="w-[1.1vw] h-[1.1vw] border-[0.25vw] border-bg rounded-sm" />
          </div>
          <span className="font-mono text-[1.1vw] tracking-[0.25em] text-text uppercase">
            SecureProfit Hub
          </span>
        </div>

        <div className="max-w-[75vw]">
          <div className="font-mono text-[1vw] tracking-[0.3em] text-primary uppercase mb-[3vh]">
            What's next
          </div>
          <h1 className="font-display font-bold text-[6.5vw] leading-[0.95] tracking-tight text-wrap-balance">
            Run the engagement.
            <span className="block text-primary">See the margin.</span>
          </h1>
          <p className="mt-[3.5vh] text-[1.6vw] text-muted max-w-[55vw] leading-snug">
            Spin up a demo workspace, load nine sample projects, and walk every
            screen — from RFP to BAST — in under five minutes.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-[2vw] border-t border-border pt-[3vh]">
          <div>
            <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.8vh]">
              Try it
            </div>
            <div className="font-display font-semibold text-[1.4vw]">
              Live preview workspace
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.8vh]">
              Stack
            </div>
            <div className="font-display font-semibold text-[1.4vw]">
              React · Express · Postgres
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.8vh]">
              Built for
            </div>
            <div className="font-display font-semibold text-[1.4vw]">
              Indonesian security firms
            </div>
          </div>
        </div>

        <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
          08 / 08
        </div>
      </div>
    </div>
  );
}
