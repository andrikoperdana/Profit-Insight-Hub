export default function ProjectLifecycle() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="relative h-full flex flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1vw] mb-[1.5vh]">
          <div className="w-[0.35vw] h-[3.2vh] bg-primary" />
          <span className="font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
            Project Lifecycle
          </span>
        </div>
        <h2 className="font-display font-bold text-[3.2vw] tracking-tight leading-tight mb-[2vh]">
          A state machine with server-enforced gates
        </h2>

        <div className="flex-1 flex flex-col justify-center">
        <div className="flex items-center gap-[0.8vw]">
          <div className="border border-border bg-bg-elevated px-[1.6vw] py-[2vh] text-center flex-1">
            <div className="font-mono font-semibold text-[1.15vw] tracking-widest">
              DRAFT
            </div>
            <div className="text-[0.9vw] text-muted mt-[0.5vh]">
              Sales intake
            </div>
          </div>
          <span className="font-display text-[1.8vw] text-primary">&rarr;</span>
          <div className="border border-border bg-bg-elevated px-[1.6vw] py-[2vh] text-center flex-1">
            <div className="font-mono font-semibold text-[1.15vw] tracking-widest">
              OBSERVATION
            </div>
            <div className="text-[0.9vw] text-muted mt-[0.5vh]">
              PM completes the plan
            </div>
          </div>
          <span className="font-display text-[1.8vw] text-primary">&rarr;</span>
          <div className="border border-primary/60 bg-bg-elevated px-[1.6vw] py-[2vh] text-center flex-1">
            <div className="font-mono font-semibold text-[1.15vw] tracking-widest text-primary">
              ACTIVE
            </div>
            <div className="text-[0.9vw] text-muted mt-[0.5vh]">
              Delivery &amp; time logging
            </div>
          </div>
          <span className="font-display text-[1.8vw] text-primary">&rarr;</span>
          <div className="border border-border bg-bg-elevated px-[1.6vw] py-[2vh] text-center flex-1">
            <div className="font-mono font-semibold text-[1.15vw] tracking-widest">
              COMPLETE
            </div>
            <div className="text-[0.9vw] text-muted mt-[0.5vh]">
              Delivery accepted
            </div>
          </div>
          <span className="font-display text-[1.8vw] text-primary">&rarr;</span>
          <div className="border border-border bg-bg-elevated px-[1.6vw] py-[2vh] text-center flex-1">
            <div className="font-mono font-semibold text-[1.15vw] tracking-widest">
              CLOSED
            </div>
            <div className="text-[0.9vw] text-muted mt-[0.5vh]">
              Archived &amp; audited
            </div>
          </div>
        </div>
        <div className="mt-[2vh] font-mono text-[0.85vw] text-muted text-center">
          ACTIVE &harr; PAUSE — projects can be paused and resumed without
          losing history
        </div>

        <div className="mt-[6vh] flex gap-[1.4vw]">
          <div className="flex-1 border border-border bg-bg-elevated px-[1.5vw] py-[2.4vh]">
            <div className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mb-[1vh]">
              Gate to ACTIVE
            </div>
            <div className="text-[1vw] text-muted leading-relaxed">
              Team staffed, tasks and risks logged, billing milestones sum to
              exactly 100% of contract value
            </div>
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.5vw] py-[2.4vh]">
            <div className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mb-[1vh]">
              Gate to COMPLETE
            </div>
            <div className="text-[1vw] text-muted leading-relaxed">
              All tasks done, no pending timesheets or expenses, signed BAST
              document on file
            </div>
          </div>
          <div className="flex-1 border border-border bg-bg-elevated px-[1.5vw] py-[2.4vh]">
            <div className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mb-[1vh]">
              Gate to CLOSED
            </div>
            <div className="text-[1vw] text-muted leading-relaxed">
              360 peer reviews submitted, lessons learned recorded, client
              satisfaction survey answered
            </div>
          </div>
        </div>
        </div>

        <div className="border-t border-border pt-[2vh] flex items-center justify-between">
          <div className="font-mono text-[0.9vw] text-muted">
            Gates run server-side for every role — a blocked transition returns
            the exact list of missing items.
          </div>
          <div className="font-mono text-[0.9vw] text-muted tracking-widest">
            07 / 10
          </div>
        </div>
      </div>
    </div>
  );
}
