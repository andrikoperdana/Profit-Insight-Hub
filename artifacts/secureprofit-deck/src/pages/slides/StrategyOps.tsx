export default function StrategyOps() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        03 / Strategy &amp; Operations
      </div>

      <div className="pt-[7vh] max-w-[70vw]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1] tracking-tight text-wrap-balance">
          The roles that set
          <span className="text-primary"> direction and the rules.</span>
        </h2>
        <p className="mt-[2vh] text-[1.25vw] text-muted max-w-[58vw] leading-relaxed">
          PMO, PM, Sales, and Site Admin form the commercial &amp; governance
          backbone — before any consultant touches the project.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-2 gap-[2vw]">
        <div className="border border-border bg-bg-elevated/40 px-[2vw] py-[3vh]">
          <div className="flex items-baseline justify-between mb-[1.5vh]">
            <div className="font-display font-semibold text-[1.7vw]">PMO Director</div>
            <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Management</div>
          </div>
          <div className="text-[1vw] text-muted mb-[1.5vh] leading-snug">
            management@itsecasia.com — Adi Wibowo
          </div>
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· See the entire portfolio &amp; executive KPIs</li>
            <li>· Assign a PM to any DRAFT project created by Sales</li>
            <li>· Track PM workload (PMAllocationCard) and project margins</li>
            <li>· Override any field, full BI &amp; financial access</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[2vw] py-[3vh]">
          <div className="flex items-baseline justify-between mb-[1.5vh]">
            <div className="font-display font-semibold text-[1.7vw]">Project Manager</div>
            <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">PM</div>
          </div>
          <div className="text-[1vw] text-muted mb-[1.5vh] leading-snug">
            pm@itsecasia.com — Sari Pratiwi
          </div>
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Complete project details (schedule, revenue, mandays, cost)</li>
            <li>· Approve / reject consultant &amp; writer timesheets</li>
            <li>· Create tasks, manage resources, log additional expenses</li>
            <li>· Approval inbox on the dashboard with one-click "Approve All"</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[2vw] py-[3vh]">
          <div className="flex items-baseline justify-between mb-[1.5vh]">
            <div className="font-display font-semibold text-[1.7vw]">Sales</div>
            <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Commercial</div>
          </div>
          <div className="text-[1vw] text-muted mb-[1.5vh] leading-snug">
            sales@itsecasia.com — Budi Santoso
          </div>
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Onboard new clients &amp; intake projects (4-field form)</li>
            <li>· Upload contract &amp; SPK file at project kickoff</li>
            <li>· Track personal pipeline and revenue per client</li>
            <li>· Cannot see margin / cost — focused on revenue</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[2vw] py-[3vh]">
          <div className="flex items-baseline justify-between mb-[1.5vh]">
            <div className="font-display font-semibold text-[1.7vw]">Site Admin</div>
            <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">System</div>
          </div>
          <div className="text-[1vw] text-muted mb-[1.5vh] leading-snug">
            siteadmin@itsecasia.com — Rina Kartika
          </div>
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Manage users (create, deactivate, change role)</li>
            <li>· Full audit-log access for investigations</li>
            <li>· No involvement in project content or financials</li>
            <li>· The only role with user-administration access</li>
          </ul>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        03 / 10
      </div>
    </div>
  );
}
