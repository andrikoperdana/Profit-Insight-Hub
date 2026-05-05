export default function Closing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute -top-[10vw] -left-[10vw] w-[40vw] h-[40vw] rounded-full bg-accent/10 blur-[6vw]" />
      <div className="absolute -bottom-[10vw] -right-[10vw] w-[45vw] h-[45vw] rounded-full bg-primary/30 blur-[8vw]" />

      <div className="relative h-full flex flex-col justify-between px-[8vw] py-[9vh]">
        <div className="flex items-center gap-[1vw]">
          <div className="w-[1.6vw] h-[1.6vw] rounded-sm bg-accent" />
          <span className="font-display font-bold text-[1.6vw] tracking-wide text-text">
            SentinelScan
          </span>
        </div>

        <div>
          <p className="font-body text-accent text-[1.3vw] tracking-[0.3em] uppercase mb-[3vh]">
            Try it now
          </p>
          <h2 className="font-display font-bold text-[6vw] leading-[0.95] tracking-tight text-text text-balance max-w-[75vw]">
            Your first pentest
            <span className="block text-accent">in minutes.</span>
          </h2>
          <p className="font-body text-muted text-[1.5vw] leading-relaxed mt-[4vh] max-w-[55vw]">
            Sign up, define a scope, run the scan, and receive
            a complete PDF report for your first engagement.
          </p>
        </div>

        <div className="flex items-end justify-between border-t border-muted/30 pt-[3vh]">
          <div>
            <p className="font-body text-muted text-[1vw] tracking-widest uppercase">Demo</p>
            <p className="font-display font-bold text-text text-[1.5vw] mt-[0.5vh]">
              profit-insight-hub.replit.app/pentest
            </p>
          </div>
          <span className="font-body text-muted text-[1vw] tracking-widest">
            CONFIDENTIAL — 2026
          </span>
        </div>
      </div>
    </div>
  );
}
