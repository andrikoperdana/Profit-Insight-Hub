export default function Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-surface">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-transparent to-accent/10" />

      <div className="relative h-full flex flex-col justify-center px-[8vw]">
        <p className="font-body text-accent text-[1.1vw] tracking-[0.3em] uppercase mb-[2.5vh]">
          02 — Solusi
        </p>
        <h2 className="font-display font-bold text-[5.4vw] leading-[1] tracking-tight text-text max-w-[70vw] text-balance">
          Satu platform, tujuh engine scanning, satu laporan.
        </h2>
        <p className="font-body text-muted text-[1.6vw] leading-relaxed mt-[4vh] max-w-[60vw]">
          SentinelScan menjalankan ZAP, DNS recon, OpenAPI fuzzing,
          SCA, header &amp; TLS check, dan SAST secara paralel — lalu
          menormalkan semua temuan ke skema CVSS v3.1 yang seragam.
        </p>

        <div className="absolute bottom-[8vh] right-[8vw] flex items-center gap-[1.2vw]">
          <span className="font-body text-muted text-[1vw] tracking-widest uppercase">
            Output
          </span>
          <span className="h-[1px] w-[3vw] bg-muted" />
          <span className="font-display font-bold text-text text-[1.6vw]">
            PDF laporan + JSON API
          </span>
        </div>
      </div>
    </div>
  );
}
