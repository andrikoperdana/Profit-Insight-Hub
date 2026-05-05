export default function Features() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="h-full flex flex-col px-[8vw] py-[9vh]">
        <div className="mb-[6vh]">
          <p className="font-body text-accent text-[1.1vw] tracking-[0.3em] uppercase mb-[2vh]">
            03 — Capabilities
          </p>
          <h2 className="font-display font-bold text-[4.4vw] leading-[1] tracking-tight text-text max-w-[70vw]">
            Three differentiating pillars.
          </h2>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-[2.5vw]">
          <div className="flex flex-col justify-between border-t-2 border-accent pt-[3vh]">
            <div>
              <p className="font-display font-bold text-accent text-[2.4vw] leading-none mb-[2vh]">
                01
              </p>
              <h3 className="font-display font-bold text-text text-[2.2vw] leading-tight mb-[2vh]">
                Multi-engine scanning
              </h3>
              <p className="font-body text-muted text-[1.25vw] leading-relaxed">
                ZAP, Nuclei, DNS recon, OpenAPI fuzzing, header &amp;
                TLS probe, and SAST run in parallel on every engagement.
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t-2 border-accent pt-[3vh]">
            <div>
              <p className="font-display font-bold text-accent text-[2.4vw] leading-none mb-[2vh]">
                02
              </p>
              <h3 className="font-display font-bold text-text text-[2.2vw] leading-tight mb-[2vh]">
                Dashboard &amp; admin
              </h3>
              <p className="font-body text-muted text-[1.25vw] leading-relaxed">
                Manage engagements, findings, pentester roles, and
                user approval from a single JWT-authenticated UI.
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t-2 border-accent pt-[3vh]">
            <div>
              <p className="font-display font-bold text-accent text-[2.4vw] leading-none mb-[2vh]">
                03
              </p>
              <h3 className="font-display font-bold text-text text-[2.2vw] leading-tight mb-[2vh]">
                Auditable PDF reports
              </h3>
              <p className="font-body text-muted text-[1.25vw] leading-relaxed">
                Cover, executive summary, heatmap, retest delta, and
                full finding details — ready to deliver to the client.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
