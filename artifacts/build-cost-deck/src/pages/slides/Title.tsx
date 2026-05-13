export default function Title() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-[#ece7da]" />
      <div className="absolute top-0 left-0 w-[38vw] h-full bg-primary" />
      <div className="absolute top-[16vh] left-[19vw] w-[3vw] h-[3vw] border-[0.35vw] border-accent" />

      <div className="relative h-full grid grid-cols-12 px-[7vw] py-[7vh]">
        <div className="col-span-5 flex flex-col justify-between text-bg">
          <div className="flex items-center gap-[0.9vw]">
            <div className="w-[2vw] h-[2vw] bg-accent" />
            <span className="font-mono text-[1vw] tracking-[0.3em] uppercase opacity-90">
              Estimasi Proyek
            </span>
          </div>

          <div className="font-mono text-[0.85vw] tracking-[0.25em] uppercase opacity-70">
            Jakarta &middot; Mei 2026
          </div>
        </div>

        <div className="col-span-7 flex flex-col justify-center pl-[3vw]">
          <div className="font-mono text-[0.95vw] tracking-[0.3em] text-accent uppercase mb-[2.5vh]">
            Internal Briefing &middot; Skenario Tanpa Replit
          </div>
          <h1 className="font-display font-bold text-[5.6vw] leading-[0.95] tracking-tight text-primary [text-wrap:balance]">
            Membangun
            <span className="block">Profit Insight Hub</span>
            <span className="block text-accent">tanpa bantuan AI.</span>
          </h1>
          <p className="mt-[3.5vh] text-[1.5vw] text-muted max-w-[42vw] leading-snug">
            Analisis kebutuhan tim, timeline, infrastruktur, dan biaya untuk
            membangun aplikasi konsultasi keamanan dari nol secara konvensional.
          </p>
        </div>

        <div className="absolute bottom-[5vh] right-[7vw] font-mono text-[0.9vw] text-muted tracking-widest">
          01 / 09
        </div>
      </div>
    </div>
  );
}
