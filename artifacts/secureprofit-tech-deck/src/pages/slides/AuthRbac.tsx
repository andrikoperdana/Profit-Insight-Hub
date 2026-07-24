export default function AuthRbac() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="relative h-full flex flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1vw] mb-[1.5vh]">
          <div className="w-[0.35vw] h-[3.2vh] bg-primary" />
          <span className="font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
            Authentication &amp; Access Control
          </span>
        </div>
        <h2 className="font-display font-bold text-[3.2vw] tracking-tight leading-tight mb-[2vh]">
          Every request carries a token, every route checks a role
        </h2>

        <div className="flex-1 flex flex-col justify-center gap-[6vh]">
        <div className="flex items-stretch gap-[1vw]">
          <div className="flex-1 border border-border bg-bg-elevated px-[1.2vw] py-[2.2vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              01
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight">
              Login
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Email + password verified against a hashed store
            </div>
          </div>
          <div className="flex items-center font-display text-[1.8vw] text-primary">
            &rarr;
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.2vw] py-[2.2vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              02
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight">
              Signed JWT
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Short-lived token identifies the user and role
            </div>
          </div>
          <div className="flex items-center font-display text-[1.8vw] text-primary">
            &rarr;
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.2vw] py-[2.2vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              03
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight">
              Bearer header
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Attached automatically to every API call
            </div>
          </div>
          <div className="flex items-center font-display text-[1.8vw] text-primary">
            &rarr;
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.2vw] py-[2.2vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              04
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight">
              Role gate
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Middleware allows or rejects the route per role
            </div>
          </div>
          <div className="flex items-center font-display text-[1.8vw] text-primary">
            &rarr;
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.2vw] py-[2.2vh]">
            <div className="font-mono text-[0.75vw] text-primary tracking-widest">
              05
            </div>
            <div className="font-display font-bold text-[1.2vw] mt-[0.8vh] leading-tight">
              Scoped query
            </div>
            <div className="text-[0.95vw] text-muted mt-[0.6vh] leading-snug">
              Each role sees only its own slice of the data
            </div>
          </div>
        </div>

        <div>
          <div className="font-mono text-[0.85vw] tracking-widest text-accent uppercase mb-[1.6vh]">
            Twelve roles, one permission model
          </div>
          <div className="flex flex-wrap gap-[0.8vw]">
            <span className="border border-primary/60 text-text font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              Management
            </span>
            <span className="border border-border text-muted font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              Project Manager
            </span>
            <span className="border border-border text-muted font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              Sales
            </span>
            <span className="border border-border text-muted font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              Konsultan
            </span>
            <span className="border border-border text-muted font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              Technical Writer
            </span>
            <span className="border border-border text-muted font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              Admin Project
            </span>
            <span className="border border-border text-muted font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              Principal &times;3
            </span>
            <span className="border border-border text-muted font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              Finance
            </span>
            <span className="border border-border text-muted font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              HR
            </span>
            <span className="border border-border text-muted font-mono text-[0.9vw] px-[1vw] py-[0.8vh]">
              Site Admin
            </span>
          </div>
        </div>
        </div>

        <div className="border-t border-border pt-[2vh] flex items-center justify-between">
          <div className="font-mono text-[0.9vw] text-muted">
            Access is default-deny: new roles must be explicitly allowlisted per
            endpoint.
          </div>
          <div className="font-mono text-[0.9vw] text-muted tracking-widest">
            06 / 10
          </div>
        </div>
      </div>
    </div>
  );
}
