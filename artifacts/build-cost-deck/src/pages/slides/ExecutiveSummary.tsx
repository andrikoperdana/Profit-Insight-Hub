export default function ExecutiveSummary() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[7vw] py-[7vh]">
      <div className="absolute top-[7vh] left-[7vw] w-[0.3vw] h-[5vh] bg-accent" />
      <div className="absolute top-[7vh] left-[8vw] font-mono text-[0.9vw] tracking-[0.3em] text-accent uppercase">
        02 &middot; Ringkasan Eksekutif
      </div>

      <div className="pt-[8vh] max-w-[80vw]">
        <h2 className="font-display font-bold text-[3.6vw] leading-[1.05] tracking-tight text-primary [text-wrap:balance]">
          Lima orang, lima hingga enam bulan,
          <span className="text-accent"> investasi setara mobil mewah.</span>
        </h2>
      </div>

      <div className="mt-[6vh] grid grid-cols-3 gap-[2vw]">
        <div className="bg-bg-elevated border border-border px-[2vw] py-[3vh]">
          <div className="font-mono text-[0.85vw] text-muted tracking-widest uppercase">
            Durasi Kalender
          </div>
          <div className="font-display font-bold text-[5vw] text-primary leading-none mt-[1.5vh]">
            5&ndash;6
          </div>
          <div className="font-display text-[1.6vw] text-primary mt-[0.5vh]">
            bulan
          </div>
          <p className="text-[1.05vw] text-muted mt-[2vh] leading-snug">
            Dari kickoff hingga production, termasuk discovery dan UAT.
          </p>
        </div>

        <div className="bg-bg-elevated border border-border px-[2vw] py-[3vh]">
          <div className="font-mono text-[0.85vw] text-muted tracking-widest uppercase">
            Ukuran Tim
          </div>
          <div className="font-display font-bold text-[5vw] text-primary leading-none mt-[1.5vh]">
            5
          </div>
          <div className="font-display text-[1.6vw] text-primary mt-[0.5vh]">
            orang inti
          </div>
          <p className="text-[1.05vw] text-muted mt-[2vh] leading-snug">
            1 PM, 1 System Analyst, 3 Developer (1 BE, 1 FE, 1 Full-stack).
          </p>
        </div>

        <div className="bg-primary text-bg px-[2vw] py-[3vh]">
          <div className="font-mono text-[0.85vw] text-accent tracking-widest uppercase">
            Total Biaya
          </div>
          <div className="font-display font-bold text-[3.6vw] leading-none mt-[1.5vh]">
            Rp 525&ndash;900
          </div>
          <div className="font-display text-[1.6vw] mt-[0.5vh] opacity-90">
            juta
          </div>
          <p className="text-[1.05vw] opacity-80 mt-[2vh] leading-snug">
            Setara USD 33k&ndash;57k. Sudah termasuk gaji, infra, tools, dan
            buffer 15%.
          </p>
        </div>
      </div>

      <div className="mt-[5vh] flex items-start gap-[1vw] max-w-[78vw]">
        <span className="font-mono text-[0.8vw] tracking-widest text-accent uppercase mt-[0.4vh]">
          Catatan
        </span>
        <p className="text-[1.1vw] text-muted leading-relaxed">
          Estimasi mengasumsikan tim sudah berpengalaman pada stack React,
          TypeScript, Node, dan Prisma. Belajar dari nol bisa menambah 2&ndash;3 bulan.
        </p>
      </div>

      <div className="absolute bottom-[4vh] right-[7vw] font-mono text-[0.9vw] text-muted tracking-widest">
        02 / 09
      </div>
    </div>
  );
}
