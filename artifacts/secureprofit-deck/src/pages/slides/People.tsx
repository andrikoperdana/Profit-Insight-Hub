const base = import.meta.env.BASE_URL;

export default function People() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <img
        src={`${base}divider.png`}
        crossOrigin="anonymous"
        alt="Capacity grid"
        className="absolute inset-0 w-full h-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/95 to-bg/70" />

      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        06 / People
      </div>

      <div className="relative px-[8vw] py-[8vh] h-full flex flex-col justify-center">
        <div className="max-w-[60vw]">
          <h2 className="font-display font-bold text-[5vw] leading-[1] tracking-tight text-wrap-balance">
            Capacity, utilization,
            <span className="block text-primary">and the bench in one view.</span>
          </h2>
          <p className="mt-[3vh] text-[1.5vw] text-muted leading-relaxed max-w-[50vw]">
            Skills-based assignment with a live workload heatmap. Sales sees who is
            bookable next week before they make a promise.
          </p>
        </div>

        <div className="mt-[6vh] grid grid-cols-3 gap-[2vw]">
          <div className="border-l-[0.25vw] border-primary pl-[1.5vw]">
            <div className="font-display font-bold text-[5.5vw] text-text leading-none">
              78%
            </div>
            <div className="font-display font-semibold text-[1.3vw] mt-[1.2vh]">
              Billable utilization
            </div>
            <div className="text-[1vw] text-muted mt-[0.5vh]">
              Rolling 4-week average
            </div>
          </div>

          <div className="border-l-[0.25vw] border-primary pl-[1.5vw]">
            <div className="font-display font-bold text-[5.5vw] text-text leading-none">
              24
            </div>
            <div className="font-display font-semibold text-[1.3vw] mt-[1.2vh]">
              Consultants tracked
            </div>
            <div className="text-[1vw] text-muted mt-[0.5vh]">
              Across pentest, audit, GRC
            </div>
          </div>

          <div className="border-l-[0.25vw] border-primary pl-[1.5vw]">
            <div className="font-display font-bold text-[5.5vw] text-text leading-none">
              6
            </div>
            <div className="font-display font-semibold text-[1.3vw] mt-[1.2vh]">
              Weeks of forward view
            </div>
            <div className="text-[1vw] text-muted mt-[0.5vh]">
              Plan with confidence
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        06 / 08
      </div>
    </div>
  );
}
