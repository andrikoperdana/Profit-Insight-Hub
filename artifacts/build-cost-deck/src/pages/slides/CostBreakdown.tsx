export default function CostBreakdown() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[7vw] py-[7vh]">
      <div className="absolute top-[7vh] left-[7vw] w-[0.3vw] h-[5vh] bg-accent" />
      <div className="absolute top-[7vh] left-[8vw] font-mono text-[0.9vw] tracking-[0.3em] text-accent uppercase">
        07 &middot; Estimasi Biaya
      </div>

      <div className="pt-[8vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.4vw] leading-[1.05] tracking-tight text-primary">
          Total investasi
          <span className="text-accent"> Rp 525 &ndash; 900 juta.</span>
        </h2>
        <p className="mt-[1.5vh] text-[1.15vw] text-muted">
          Range gaji menggunakan tarif medior&ndash;senior Jakarta tahun 2026.
        </p>
      </div>

      <div className="mt-[4.5vh]">
        <div className="grid grid-cols-12 border-t-[0.2vw] border-primary py-[1.4vh] font-mono text-[0.82vw] text-accent tracking-widest uppercase">
          <div className="col-span-5">Komponen</div>
          <div className="col-span-2 text-right">Tarif / Bulan</div>
          <div className="col-span-1 text-center">Qty</div>
          <div className="col-span-1 text-center">Bulan</div>
          <div className="col-span-3 text-right">Subtotal</div>
        </div>

        <div className="grid grid-cols-12 py-[1.4vh] border-b border-border items-baseline">
          <div className="col-span-5 text-[1.1vw] text-text">Project Manager</div>
          <div className="col-span-2 text-right font-mono text-[1vw] text-muted">Rp 20&ndash;35 jt</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">1</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">5</div>
          <div className="col-span-3 text-right font-mono text-[1.1vw] text-primary font-semibold">Rp 100&ndash;175 jt</div>
        </div>

        <div className="grid grid-cols-12 py-[1.4vh] border-b border-border items-baseline">
          <div className="col-span-5 text-[1.1vw] text-text">System Analyst</div>
          <div className="col-span-2 text-right font-mono text-[1vw] text-muted">Rp 15&ndash;25 jt</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">1</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">5</div>
          <div className="col-span-3 text-right font-mono text-[1.1vw] text-primary font-semibold">Rp 75&ndash;125 jt</div>
        </div>

        <div className="grid grid-cols-12 py-[1.4vh] border-b border-border items-baseline">
          <div className="col-span-5 text-[1.1vw] text-text">Developer (BE + FE + Full-stack)</div>
          <div className="col-span-2 text-right font-mono text-[1vw] text-muted">Rp 18&ndash;30 jt</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">3</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">5</div>
          <div className="col-span-3 text-right font-mono text-[1.1vw] text-primary font-semibold">Rp 270&ndash;450 jt</div>
        </div>

        <div className="grid grid-cols-12 py-[1.4vh] border-b border-border items-baseline">
          <div className="col-span-5 text-[1.1vw] text-text">Infrastruktur (hosting, DB, backup)</div>
          <div className="col-span-2 text-right font-mono text-[1vw] text-muted">&mdash;</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">&mdash;</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">5</div>
          <div className="col-span-3 text-right font-mono text-[1.1vw] text-primary font-semibold">Rp 5&ndash;25 jt</div>
        </div>

        <div className="grid grid-cols-12 py-[1.4vh] border-b border-border items-baseline">
          <div className="col-span-5 text-[1.1vw] text-text">Tools &amp; lisensi (Jira, Figma, dll)</div>
          <div className="col-span-2 text-right font-mono text-[1vw] text-muted">&mdash;</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">&mdash;</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">5</div>
          <div className="col-span-3 text-right font-mono text-[1.1vw] text-primary font-semibold">Rp 5&ndash;15 jt</div>
        </div>

        <div className="grid grid-cols-12 py-[1.4vh] border-b border-border items-baseline">
          <div className="col-span-5 text-[1.1vw] text-text">Buffer 15% (overrun, training, hardware)</div>
          <div className="col-span-2 text-right font-mono text-[1vw] text-muted">&mdash;</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">&mdash;</div>
          <div className="col-span-1 text-center font-mono text-[1vw] text-muted">&mdash;</div>
          <div className="col-span-3 text-right font-mono text-[1.1vw] text-primary font-semibold">Rp 70&ndash;120 jt</div>
        </div>

        <div className="grid grid-cols-12 py-[2vh] bg-primary text-bg items-baseline mt-[1vh]">
          <div className="col-span-5 pl-[1.5vw] font-display font-bold text-[1.6vw]">GRAND TOTAL</div>
          <div className="col-span-2 text-right font-mono text-[0.9vw] opacity-70">~ USD 33k&ndash;57k</div>
          <div className="col-span-1" />
          <div className="col-span-1" />
          <div className="col-span-3 text-right pr-[1.5vw] font-display font-bold text-[2.2vw] text-accent">Rp 525&ndash;900 jt</div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[7vw] font-mono text-[0.9vw] text-muted tracking-widest">
        07 / 09
      </div>
    </div>
  );
}
