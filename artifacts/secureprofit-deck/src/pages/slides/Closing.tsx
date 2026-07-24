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

        <div className="max-w-[78vw]">
          <div className="font-mono text-[1vw] tracking-[0.3em] text-primary uppercase mb-[3vh]">
            Summary
          </div>
          <h1 className="font-display font-bold text-[5.6vw] leading-[0.95] tracking-tight text-wrap-balance">
            Twelve roles, one path,
            <span className="block text-primary">profit and satisfaction measured.</span>
          </h1>
          <p className="mt-[3.5vh] text-[1.4vw] text-muted max-w-[60vw] leading-snug">
            Sales starts. PMO directs. PM executes. Principals safeguard the
            people. Consultants, writers, and admins deliver. Finance guards the
            numbers, HR the people ops, Site Admin the system. The client closes
            it with a survey — all on a single platform.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-[2vw] border-t border-border pt-[3vh]">
          <div>
            <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.8vh]">
              Demo login
            </div>
            <div className="font-display font-semibold text-[1.3vw]">
              All passwords: <span className="font-mono">password123</span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.8vh]">
              Try it now
            </div>
            <div className="font-display font-semibold text-[1.3vw]">
              Explore each role's dashboard
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.8vh]">
              Built for
            </div>
            <div className="font-display font-semibold text-[1.3vw]">
              Indonesian IT security consulting
            </div>
          </div>
        </div>

        <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
          17 / 17
        </div>
      </div>
    </div>
  );
}
