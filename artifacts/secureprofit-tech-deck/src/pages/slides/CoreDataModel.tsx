export default function CoreDataModel() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="relative h-full flex flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1vw] mb-[1.5vh]">
          <div className="w-[0.35vw] h-[3.2vh] bg-primary" />
          <span className="font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
            Core Data Model
          </span>
        </div>
        <h2 className="font-display font-bold text-[3.2vw] tracking-tight leading-tight mb-[3.5vh]">
          Everything hangs off the <span className="text-primary">Project</span>
        </h2>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex gap-[2.4vw]">
            <div className="border border-border bg-bg-elevated px-[1.8vw] py-[1.6vh]">
              <div className="font-mono text-[0.75vw] tracking-widest text-accent uppercase">
                Client
              </div>
              <div className="text-[0.95vw] text-muted mt-[0.3vh]">
                Company &amp; contacts
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.8vw] py-[1.6vh]">
              <div className="font-mono text-[0.75vw] tracking-widest text-accent uppercase">
                User
              </div>
              <div className="text-[0.95vw] text-muted mt-[0.3vh]">
                Roles, seniority, business unit
              </div>
            </div>
          </div>

          <div className="w-px h-[3.5vh] bg-border" />

          <div className="border border-primary/60 bg-bg-elevated px-[3vw] py-[2.4vh] text-center">
            <div className="font-mono text-[0.85vw] tracking-widest text-primary uppercase">
              Project
            </div>
            <div className="text-[1.05vw] text-muted mt-[0.5vh]">
              Status · contract value · dates · staffing · kind
            </div>
          </div>

          <div className="w-px h-[3.5vh] bg-border" />

          <div className="flex gap-[1.2vw]">
            <div className="border border-border bg-bg-elevated px-[1.2vw] py-[1.6vh] w-[15vw]">
              <div className="font-mono text-[0.75vw] tracking-widest text-accent uppercase">
                Resources
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.4vh] leading-snug">
                Staffing plan with a full daily-rate history
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.2vw] py-[1.6vh] w-[15vw]">
              <div className="font-mono text-[0.75vw] tracking-widest text-accent uppercase">
                Tasks
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.4vh] leading-snug">
                Work breakdown with dependencies and hour caps
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.2vw] py-[1.6vh] w-[15vw]">
              <div className="font-mono text-[0.75vw] tracking-widest text-accent uppercase">
                Timesheets
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.4vh] leading-snug">
                Draft to approved, per task and day
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.2vw] py-[1.6vh] w-[15vw]">
              <div className="font-mono text-[0.75vw] tracking-widest text-accent uppercase">
                Expenses
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.4vh] leading-snug">
                Approval flow, cash advances, purchase orders
              </div>
            </div>
            <div className="border border-border bg-bg-elevated px-[1.2vw] py-[1.6vh] w-[15vw]">
              <div className="font-mono text-[0.75vw] tracking-widest text-accent uppercase">
                Billing
              </div>
              <div className="text-[0.9vw] text-muted mt-[0.4vh] leading-snug">
                Payment milestones with VAT split
              </div>
            </div>
          </div>
        </div>

        <div className="mt-[3vh] border-t border-border pt-[2vh] flex items-center justify-between">
          <div className="font-mono text-[0.9vw] text-muted">
            Plus RAID log, change requests, baselines, documents, and 360
            feedback — over 40 models in total.
          </div>
          <div className="font-mono text-[0.9vw] text-muted tracking-widest">
            05 / 10
          </div>
        </div>
      </div>
    </div>
  );
}
