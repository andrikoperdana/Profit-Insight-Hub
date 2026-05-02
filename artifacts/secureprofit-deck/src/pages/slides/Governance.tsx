export default function Governance() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[8vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        07 / Governance
      </div>

      <div className="pt-[8vh]">
        <h2 className="font-display font-bold text-[4.8vw] leading-[1] tracking-tight text-wrap-balance max-w-[70vw]">
          Role-aware by design,
          <span className="text-primary"> audit-ready by default.</span>
        </h2>
      </div>

      <div className="grid grid-cols-12 gap-[2.5vw] mt-[7vh]">
        <div className="col-span-7">
          <div className="font-mono text-[0.9vw] tracking-widest text-primary uppercase mb-[2vh]">
            Six roles, scoped permissions
          </div>
          <div className="grid grid-cols-3 gap-[1vw]">
            <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh] text-center">
              <div className="font-display font-semibold text-[1.2vw]">
                PMO Director
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh]">
                Portfolio &amp; finance
              </div>
            </div>
            <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh] text-center">
              <div className="font-display font-semibold text-[1.2vw]">
                Project Manager
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh]">
                Owns delivery
              </div>
            </div>
            <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh] text-center">
              <div className="font-display font-semibold text-[1.2vw]">Sales</div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh]">
                Pipeline &amp; close
              </div>
            </div>
            <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh] text-center">
              <div className="font-display font-semibold text-[1.2vw]">
                Consultant
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh]">
                Logs delivery
              </div>
            </div>
            <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh] text-center">
              <div className="font-display font-semibold text-[1.2vw]">
                Tech Writer
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh]">
                Reports &amp; BAST
              </div>
            </div>
            <div className="border border-border bg-bg-elevated/40 px-[1.2vw] py-[1.8vh] text-center">
              <div className="font-display font-semibold text-[1.2vw]">
                Admin Project
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh]">
                Ops support
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-5 border-l border-border pl-[2.5vw] flex flex-col justify-center">
          <div className="font-mono text-[0.9vw] tracking-widest text-primary uppercase mb-[2vh]">
            Trust &amp; transparency
          </div>
          <div className="text-[1.4vw] leading-snug text-text mb-[2.5vh]">
            Every change — assignment, approval, status, rate — is recorded with
            actor, before, and after.
          </div>
          <div className="flex items-center gap-[1vw] text-[1.1vw] text-muted mb-[1vh]">
            <span className="font-mono text-primary">✓</span>
            <span>Immutable audit log across the platform</span>
          </div>
          <div className="flex items-center gap-[1vw] text-[1.1vw] text-muted mb-[1vh]">
            <span className="font-mono text-primary">✓</span>
            <span>BI dashboard for executive review</span>
          </div>
          <div className="flex items-center gap-[1vw] text-[1.1vw] text-muted">
            <span className="font-mono text-primary">✓</span>
            <span>CSAT surveys close the customer loop</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        07 / 08
      </div>
    </div>
  );
}
