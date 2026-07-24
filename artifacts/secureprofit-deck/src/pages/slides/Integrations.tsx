export default function Integrations() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        16 / Integrations &amp; Reach
      </div>

      <div className="pt-[7vh] max-w-[76vw]">
        <h2 className="font-display font-bold text-[4vw] leading-[1] tracking-tight text-wrap-balance">
          Connected to the tools
          <span className="text-primary"> the business already runs on.</span>
        </h2>
        <p className="mt-[2vh] text-[1.2vw] text-muted max-w-[62vw] leading-relaxed">
          Accounting, CRM, email, AI, mobile, and the client&rsquo;s own inbox —
          the platform meets people where they work.
        </p>
      </div>

      <div className="mt-[4.5vh] grid grid-cols-3 gap-[1.4vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.2vh]">
          <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase">Accounting</div>
          <div className="font-display font-semibold text-[1.35vw] mt-[0.6vh]">Xero</div>
          <p className="text-[0.9vw] text-muted mt-[1vh] leading-snug">
            Push an invoice per billing milestone straight to Xero; payment
            status syncs back and marks the milestone PAID.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.2vh]">
          <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase">CRM</div>
          <div className="font-display font-semibold text-[1.35vw] mt-[0.6vh]">Pipedrive</div>
          <p className="text-[0.9vw] text-muted mt-[1vh] leading-snug">
            One-way import of open deals into the Sales Pipeline — leads are
            won here, then converted into DRAFT projects.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.2vh]">
          <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase">Email</div>
          <div className="font-display font-semibold text-[1.35vw] mt-[0.6vh]">Notifications</div>
          <p className="text-[0.9vw] text-muted mt-[1vh] leading-snug">
            Important events reach the inbox — timesheet decisions, staffing,
            billing — with a global on/off switch in Settings.
          </p>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.4vw] py-[2.2vh]">
          <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase">AI</div>
          <div className="font-display font-semibold text-[1.35vw] mt-[0.6vh]">Executive Copilot</div>
          <p className="text-[0.9vw] text-muted mt-[1vh] leading-snug">
            A one-page portfolio briefing with Top 5 actions. Every number is
            computed by the system — the AI only writes the narrative.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.2vh]">
          <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase">Mobile</div>
          <div className="font-display font-semibold text-[1.35vw] mt-[0.6vh]">Companion App</div>
          <p className="text-[0.9vw] text-muted mt-[1vh] leading-snug">
            Consultants log timesheets and expenses from the phone — with a
            running timer for on-site work.
          </p>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.2vh]">
          <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase">Client</div>
          <div className="font-display font-semibold text-[1.35vw] mt-[0.6vh]">Progress Portal</div>
          <p className="text-[0.9vw] text-muted mt-[1vh] leading-snug">
            A read-only progress link per project — no login, no documents, no
            financials. Clients see status, not spreadsheets.
          </p>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        16 / 17
      </div>
    </div>
  );
}
