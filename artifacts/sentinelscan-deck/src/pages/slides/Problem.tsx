export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-0 right-0 w-[40vw] h-[40vw] rounded-full bg-accent/5 blur-[8vw]" />

      <div className="relative h-full grid grid-cols-12 gap-[3vw] px-[8vw] py-[10vh]">
        <div className="col-span-5 flex flex-col justify-between">
          <div>
            <p className="font-body text-accent text-[1.1vw] tracking-[0.3em] uppercase mb-[2vh]">
              01 — Problem
            </p>
            <h2 className="font-display font-bold text-[4.6vw] leading-[1] tracking-tight text-text text-balance">
              Manual pentests are expensive, slow, and inconsistent.
            </h2>
          </div>
          <p className="font-body text-muted text-[1.3vw] leading-relaxed max-w-[28vw]">
            Security teams wait weeks for reports, with formats that
            differ from one vendor to the next.
          </p>
        </div>

        <div className="col-span-7 flex flex-col justify-center gap-[3vh]">
          <div className="border-l-2 border-accent pl-[2vw]">
            <p className="font-display font-bold text-[3.6vw] text-text leading-none">
              4–6 weeks
            </p>
            <p className="font-body text-muted text-[1.2vw] mt-[1vh]">
              average wait time from kickoff to final report
            </p>
          </div>
          <div className="border-l-2 border-accent pl-[2vw]">
            <p className="font-display font-bold text-[3.6vw] text-text leading-none">
              60–80%
            </p>
            <p className="font-body text-muted text-[1.2vw] mt-[1vh]">
              of engagement cost spent on repetitive work that can be automated
            </p>
          </div>
          <div className="border-l-2 border-accent pl-[2vw]">
            <p className="font-display font-bold text-[3.6vw] text-text leading-none">
              No audit trail
            </p>
            <p className="font-body text-muted text-[1.2vw] mt-[1vh]">
              for retest evidence, severity changes, or finding history across reports
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
