export default function ExternalIntegrations() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="relative h-full flex flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1vw] mb-[1.5vh]">
          <div className="w-[0.35vw] h-[3.2vh] bg-primary" />
          <span className="font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
            External Integrations
          </span>
        </div>
        <h2 className="font-display font-bold text-[3.2vw] tracking-tight leading-tight mb-[4.5vh]">
          The API server owns every outbound connection
        </h2>

        <div className="flex-1 flex items-center gap-[2vw]">
          <div className="border border-primary/60 bg-bg-elevated px-[2vw] py-[5vh] w-[26vw]">
            <div className="font-mono text-[0.85vw] tracking-widest text-primary uppercase mb-[1.2vh]">
              API Server
            </div>
            <div className="font-display font-bold text-[1.8vw] leading-tight">
              Single integration point
            </div>
            <div className="text-[1.05vw] text-muted mt-[2vh] leading-snug">
              Credentials live server-side only. External systems never touch
              the database or the clients directly.
            </div>
          </div>

          <div className="flex flex-col items-center w-[5vw]">
            <span className="font-display text-[2.4vw] text-primary leading-none">
              &harr;
            </span>
          </div>

          <div className="flex-1 flex flex-col gap-[2.4vh]">
            <div className="border border-border bg-bg-elevated px-[1.8vw] py-[2.4vh] flex items-start gap-[1.5vw]">
              <div className="font-mono font-semibold text-[1.25vw] text-accent w-[10vw]">
                Xero
              </div>
              <div className="text-[1vw] text-muted leading-snug flex-1">
                Invoice push and payment status sync — each milestone is
                lock-guarded so an invoice can never be sent twice.
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.8vw] py-[2.4vh] flex items-start gap-[1.5vw]">
              <div className="font-mono font-semibold text-[1.25vw] text-accent w-[10vw]">
                Pipedrive
              </div>
              <div className="text-[1vw] text-muted leading-snug flex-1">
                One-way import of open deals into the sales lead pipeline,
                running as an asynchronous background sync.
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.8vw] py-[2.4vh] flex items-start gap-[1.5vw]">
              <div className="font-mono font-semibold text-[1.25vw] text-accent w-[10vw]">
                Resend
              </div>
              <div className="text-[1vw] text-muted leading-snug flex-1">
                Transactional email for important notifications — best-effort,
                globally kill-switched, never blocks a request.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-[3.5vh] border-t border-border pt-[2vh] flex items-center justify-between">
          <div className="font-mono text-[0.9vw] text-muted">
            Every integration is designed to fail safely: retries, locks, and
            timeouts protect the core workflow.
          </div>
          <div className="font-mono text-[0.9vw] text-muted tracking-widest">
            09 / 10
          </div>
        </div>
      </div>
    </div>
  );
}
