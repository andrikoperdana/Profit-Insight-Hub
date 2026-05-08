export default function Principals() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        05 / Principal Supervisors
      </div>

      <div className="pt-[7vh] max-w-[72vw]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1] tracking-tight text-wrap-balance">
          Three supervisors
          <span className="text-primary"> safeguarding people quality.</span>
        </h2>
        <p className="mt-[2vh] text-[1.25vw] text-muted max-w-[60vw] leading-relaxed">
          Principals oversee their team's skills and workload, then propose or
          assign people to projects. The PM still holds the final decision.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-3 gap-[1.6vw]">
        <div className="border border-primary/40 bg-primary/5 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.55vw]">Principal Consultant</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Bayu Prasetyo
          </div>
          <div className="text-[0.9vw] text-muted mt-[0.8vh] leading-snug">
            principal.kon.h7q4@itsecasia.com
          </div>
          <div className="border-t border-primary/30 my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Supervises every Consultant</li>
            <li>· <span className="text-primary">Proposes</span> consultants to projects (PM accepts)</li>
            <li>· Sees the "Projects needing consultant" dashboard</li>
            <li>· Cannot see commercial / margin figures</li>
          </ul>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.55vw]">Principal Tech Writer</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Indah Kusumawardani
          </div>
          <div className="text-[0.9vw] text-muted mt-[0.8vh] leading-snug">
            principal.tw.m9k2@itsecasia.com
          </div>
          <div className="border-t border-primary/30 my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Supervises every Technical Writer</li>
            <li>· <span className="text-primary">Directly assigns</span> 1 writer per project</li>
            <li>· Ensures writing capacity is well distributed</li>
            <li>· Cannot see commercial / margin figures</li>
          </ul>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.55vw]">Principal Project Admin</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Fajar Nugroho
          </div>
          <div className="text-[0.9vw] text-muted mt-[0.8vh] leading-snug">
            principal.ap.r3n8@itsecasia.com
          </div>
          <div className="border-t border-primary/30 my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Supervises every Project Admin</li>
            <li>· <span className="text-primary">Directly assigns</span> 1 admin per project</li>
            <li>· Ensures every project has a closing admin</li>
            <li>· Cannot see commercial / margin figures</li>
          </ul>
        </div>
      </div>

      <div className="mt-[4vh] border-t border-border pt-[2vh] flex items-center gap-[1vw] max-w-[80vw]">
        <span className="font-mono text-primary text-[1vw]">i</span>
        <span className="text-[1vw] text-muted leading-snug">
          The Principal Consultant uses a <span className="text-text">propose → accept</span>
          flow because a single project can need multiple consultants; Principal
          TW and PA assign directly because only one person of each is needed per project.
        </span>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        05 / 10
      </div>
    </div>
  );
}
