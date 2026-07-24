export default function ContractFirstApi() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="relative h-full flex flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1vw] mb-[1.5vh]">
          <div className="w-[0.35vw] h-[3.2vh] bg-primary" />
          <span className="font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
            Contract-First API
          </span>
        </div>
        <h2 className="font-display font-bold text-[3.2vw] tracking-tight leading-tight mb-[4.5vh]">
          The API is defined once, then generated everywhere
        </h2>

        <div className="flex-1 flex items-center gap-[1.4vw]">
          <div className="border border-primary/60 bg-bg-elevated px-[1.6vw] py-[3vh] w-[22vw]">
            <div className="font-mono text-[0.8vw] tracking-widest text-primary uppercase mb-[1vh]">
              Source of truth
            </div>
            <div className="font-mono font-semibold text-[1.4vw] leading-tight">
              openapi.yaml
            </div>
            <div className="text-[1vw] text-muted mt-[1.5vh] leading-snug">
              Every endpoint, request, and response shape declared in one
              OpenAPI 3 file
            </div>
          </div>

          <div className="flex flex-col items-center w-[5vw]">
            <span className="font-display text-[2.4vw] text-primary leading-none">
              &rarr;
            </span>
            <span className="font-mono text-[0.7vw] text-muted mt-[1vh] tracking-widest uppercase text-center">
              codegen
            </span>
          </div>

          <div className="flex flex-col gap-[2.4vh] w-[24vw]">
            <div className="border border-border bg-bg-elevated px-[1.6vw] py-[2.4vh]">
              <div className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mb-[0.7vh]">
                Generated
              </div>
              <div className="font-display font-bold text-[1.3vw] leading-tight">
                React Query hooks
              </div>
              <div className="text-[0.95vw] text-muted mt-[0.5vh] leading-snug">
                Typed data fetching for web and mobile
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.6vw] py-[2.4vh]">
              <div className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mb-[0.7vh]">
                Generated
              </div>
              <div className="font-display font-bold text-[1.3vw] leading-tight">
                Zod schemas
              </div>
              <div className="text-[0.95vw] text-muted mt-[0.5vh] leading-snug">
                Runtime validation of every payload
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center w-[5vw]">
            <span className="font-display text-[2.4vw] text-primary leading-none">
              &rarr;
            </span>
            <span className="font-mono text-[0.7vw] text-muted mt-[1vh] tracking-widest uppercase text-center">
              consumed by
            </span>
          </div>

          <div className="flex flex-col gap-[2.4vh] w-[24vw]">
            <div className="border border-border bg-bg-elevated px-[1.6vw] py-[2.4vh]">
              <div className="font-display font-bold text-[1.3vw] leading-tight">
                Web &amp; Mobile
              </div>
              <div className="text-[0.95vw] text-muted mt-[0.5vh] leading-snug">
                Call the API through generated hooks — no hand-written fetch
                code
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.6vw] py-[2.4vh]">
              <div className="font-display font-bold text-[1.3vw] leading-tight">
                API Server
              </div>
              <div className="text-[0.95vw] text-muted mt-[0.5vh] leading-snug">
                Validates inputs and outputs against the same schemas
              </div>
            </div>
          </div>
        </div>

        <div className="mt-[3.5vh] border-t border-border pt-[2vh] flex items-center justify-between">
          <div className="font-mono text-[0.9vw] text-muted">
            Server and clients cannot drift apart — both sides are generated
            from the same file.
          </div>
          <div className="font-mono text-[0.9vw] text-muted tracking-widest">
            04 / 10
          </div>
        </div>
      </div>
    </div>
  );
}
