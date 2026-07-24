export default function Roles() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        02 / Roles
      </div>

      <div className="pt-[7vh]">
        <h2 className="font-display font-bold text-[4.4vw] leading-[1] tracking-tight text-wrap-balance max-w-[72vw]">
          Twelve roles working
          <span className="text-primary"> on a single platform.</span>
        </h2>
        <p className="mt-[2vh] text-[1.3vw] text-muted max-w-[60vw] leading-relaxed">
          Strategy, commercial, delivery, supervision, finance, people ops, and
          system administration — each role gets its own dashboard and access
          scope.
        </p>
      </div>

      <div className="mt-[4vh] grid grid-cols-4 gap-[1.2vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Strategy</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">PMO Director</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Portfolio &amp; PM assignment</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Delivery</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Project Manager</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Execution &amp; timesheet approval</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Commercial</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Sales</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Pipeline &amp; project intake</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Field</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Consultant</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Pentest &amp; mandays logging</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Field</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Technical Writer</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Reports &amp; documentation</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Operations</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Project Admin</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">BAST, invoice, closing docs</div>
        </div>
        <div className="border border-primary/40 bg-primary/5 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Principal</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Principal Consultant</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Proposes consultants to PM</div>
        </div>
        <div className="border border-primary/40 bg-primary/5 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Principal</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Principal Tech Writer</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Proposes writers to projects</div>
        </div>
        <div className="border border-primary/40 bg-primary/5 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Principal</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Principal Project Admin</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Proposes admins to projects</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Oversight</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Finance</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Read-only P&amp;L, invoices, VAT recap</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">People</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">HR</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Work hours, leaves, skill matrix</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">System</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Site Admin</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Manages users &amp; audit log</div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        02 / 17
      </div>
    </div>
  );
}
