const base = import.meta.env.BASE_URL;

export default function Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <img
        src={`${base}hero-cyber.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover opacity-50"
        alt=""
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-transparent to-bg/40" />

      <div className="relative h-full flex flex-col justify-between px-[8vw] py-[7vh]">
        <div className="flex items-center gap-[1vw]">
          <div className="w-[1.6vw] h-[1.6vw] rounded-sm bg-accent" />
          <span className="font-display font-bold text-[1.6vw] tracking-wide text-text">
            SentinelScan
          </span>
        </div>

        <div className="max-w-[68vw]">
          <p className="font-body text-accent text-[1.4vw] tracking-[0.3em] uppercase mb-[2.5vh]">
            Penetration Testing Platform
          </p>
          <h1 className="font-display font-bold text-[6.4vw] leading-[0.95] tracking-tight text-text text-balance">
            Pentests that are
            <span className="block text-accent">automated &amp; auditable.</span>
          </h1>
          <p className="font-body text-muted text-[1.7vw] mt-[3.5vh] max-w-[55vw] leading-relaxed">
            Greybox security testing with multi-engine scanning,
            ready-to-send PDF reports, and an audit trail for every engagement.
          </p>
        </div>

        <div className="flex items-end justify-between text-muted font-body text-[1.1vw]">
          <span>Confidential — Pitch Deck</span>
          <span className="tracking-widest">2026</span>
        </div>
      </div>
    </div>
  );
}
