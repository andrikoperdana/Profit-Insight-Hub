export default function RisksAndAcceleration() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[7vw] py-[7vh]">
      <div className="absolute top-[7vh] left-[7vw] w-[0.3vw] h-[5vh] bg-accent" />
      <div className="absolute top-[7vh] left-[8vw] font-mono text-[0.9vw] tracking-[0.3em] text-accent uppercase">
        08 &middot; Risiko vs Akselerasi
      </div>

      <div className="pt-[8vh] max-w-[80vw]">
        <h2 className="font-display font-bold text-[3.4vw] leading-[1.05] tracking-tight text-primary">
          Apa yang bisa molor &mdash; dan apa yang bisa mempercepat.
        </h2>
      </div>

      <div className="mt-[5vh] grid grid-cols-2 gap-[2.5vw]">
        <div className="bg-bg-elevated border border-border px-[2vw] py-[3vh]">
          <div className="font-mono text-[0.85vw] text-accent tracking-widest uppercase">
            Risiko &mdash; bisa molor jadi 7&ndash;8 bulan
          </div>
          <div className="mt-[2.5vh] space-y-[1.6vh]">
            <div className="flex gap-[1vw] items-start">
              <span className="font-mono text-[1.1vw] text-accent">01</span>
              <p className="text-[1.05vw] text-text leading-snug flex-1">
                Requirement berubah di tengah jalan &mdash; sangat umum di proyek
                internal.
              </p>
            </div>
            <div className="flex gap-[1vw] items-start">
              <span className="font-mono text-[1.1vw] text-accent">02</span>
              <p className="text-[1.05vw] text-text leading-snug flex-1">
                10 role + 3 Principal + multi-tab project = ratusan permission
                edge case.
              </p>
            </div>
            <div className="flex gap-[1vw] items-start">
              <span className="font-mono text-[1.1vw] text-accent">03</span>
              <p className="text-[1.05vw] text-text leading-snug flex-1">
                Visual Gantt dengan dependency arrows + drag-resize bukan
                komponen jadi.
              </p>
            </div>
            <div className="flex gap-[1vw] items-start">
              <span className="font-mono text-[1.1vw] text-accent">04</span>
              <p className="text-[1.05vw] text-text leading-snug flex-1">
                Boilerplate berulang per endpoint: route, handler, schema, hook,
                form.
              </p>
            </div>
            <div className="flex gap-[1vw] items-start">
              <span className="font-mono text-[1.1vw] text-accent">05</span>
              <p className="text-[1.05vw] text-text leading-snug flex-1">
                Dokumentasi tertinggal jika tidak ketat di-enforce sejak awal.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-primary text-bg px-[2vw] py-[3vh]">
          <div className="font-mono text-[0.85vw] text-accent tracking-widest uppercase">
            Akselerasi dengan Replit / AI
          </div>
          <div className="mt-[2.5vh] space-y-[1.6vh]">
            <div className="grid grid-cols-12 gap-[1vw] items-baseline border-b border-bg/20 pb-[1.2vh]">
              <span className="col-span-7 text-[1.05vw]">Generate boilerplate (route, hook, form)</span>
              <span className="col-span-5 text-right font-mono text-[1.2vw] text-accent font-semibold">hemat 30&ndash;40%</span>
            </div>
            <div className="grid grid-cols-12 gap-[1vw] items-baseline border-b border-bg/20 pb-[1.2vh]">
              <span className="col-span-7 text-[1.05vw]">Setup monorepo + OpenAPI codegen</span>
              <span className="col-span-5 text-right font-mono text-[1.2vw] text-accent font-semibold">hemat 50%</span>
            </div>
            <div className="grid grid-cols-12 gap-[1vw] items-baseline border-b border-bg/20 pb-[1.2vh]">
              <span className="col-span-7 text-[1.05vw]">Debug stack trace, lint, type</span>
              <span className="col-span-5 text-right font-mono text-[1.2vw] text-accent font-semibold">hemat 20&ndash;30%</span>
            </div>
            <div className="grid grid-cols-12 gap-[1vw] items-baseline border-b border-bg/20 pb-[1.2vh]">
              <span className="col-span-7 text-[1.05vw]">Refactor &amp; rename across files</span>
              <span className="col-span-5 text-right font-mono text-[1.2vw] text-accent font-semibold">hemat 60%</span>
            </div>
            <div className="grid grid-cols-12 gap-[1vw] items-baseline border-b border-bg/20 pb-[1.2vh]">
              <span className="col-span-7 text-[1.05vw]">Generate seed data realistis</span>
              <span className="col-span-5 text-right font-mono text-[1.2vw] text-accent font-semibold">hemat 70%</span>
            </div>
            <div className="grid grid-cols-12 gap-[1vw] items-baseline pb-[1.2vh]">
              <span className="col-span-7 text-[1.05vw]">Dokumentasi otomatis</span>
              <span className="col-span-5 text-right font-mono text-[1.2vw] text-accent font-semibold">hemat 80%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-[3.5vh] bg-accent/15 border-l-[0.4vw] border-accent px-[2vw] py-[2vh]">
        <p className="text-[1.2vw] text-primary leading-snug">
          <span className="font-display font-bold">Net effect:</span> dengan
          AI assist, tim 5 orang yang sama bisa selesai
          <span className="font-display font-bold text-accent"> 3&ndash;3,5 bulan </span>
          alih-alih 5&ndash;6 bulan, dengan kualitas setara.
        </p>
      </div>

      <div className="absolute bottom-[4vh] right-[7vw] font-mono text-[0.9vw] text-muted tracking-widest">
        08 / 09
      </div>
    </div>
  );
}
