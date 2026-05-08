export default function Lifecycle() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        06 / Alur End-to-End
      </div>

      <div className="pt-[7vh] max-w-[72vw]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1] tracking-tight text-wrap-balance">
          Dari intake Sales
          <span className="text-primary"> sampai survei kepuasan otomatis.</span>
        </h2>
        <p className="mt-[2vh] text-[1.25vw] text-muted max-w-[62vw] leading-relaxed">
          Tujuh tahap status proyek, masing-masing dengan pemilik &amp; tugas yang
          jelas. CSAT terkirim otomatis begitu proyek pindah ke CLOSED.
        </p>
      </div>

      <div className="mt-[7vh] relative">
        <div className="absolute left-[2%] right-[2%] top-[4.2vh] h-[0.18vw] bg-border" />
        <div className="absolute left-[2%] top-[4.2vh] h-[0.18vw] bg-primary w-[100%]" />

        <div className="grid grid-cols-7 gap-[0.5vw] relative">
          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">01</div>
            <div className="font-display font-semibold text-[1.25vw] mt-[2.2vh]">DRAFT</div>
            <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase mt-[0.5vh]">Sales</div>
            <div className="text-[0.9vw] text-muted mt-[0.6vh] leading-snug">Intake 4 field: nama, SPK, klien, nilai</div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">02</div>
            <div className="font-display font-semibold text-[1.25vw] mt-[2.2vh]">Assignment</div>
            <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase mt-[0.5vh]">PMO</div>
            <div className="text-[0.9vw] text-muted mt-[0.6vh] leading-snug">PMO Director menetapkan PM</div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">03</div>
            <div className="font-display font-semibold text-[1.25vw] mt-[2.2vh]">OBSERVATION</div>
            <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase mt-[0.5vh]">PM</div>
            <div className="text-[0.9vw] text-muted mt-[0.6vh] leading-snug">PM lengkapi detail &amp; baseline biaya</div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">04</div>
            <div className="font-display font-semibold text-[1.25vw] mt-[2.2vh]">Resourcing</div>
            <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase mt-[0.5vh]">Principal &amp; PM</div>
            <div className="text-[0.9vw] text-muted mt-[0.6vh] leading-snug">Konsultan, writer, admin terisi</div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">05</div>
            <div className="font-display font-semibold text-[1.25vw] mt-[2.2vh]">ACTIVE</div>
            <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase mt-[0.5vh]">Tim eksekusi</div>
            <div className="text-[0.9vw] text-muted mt-[0.6vh] leading-snug">Timesheet, task, expense berjalan</div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">06</div>
            <div className="font-display font-semibold text-[1.25vw] mt-[2.2vh]">COMPLETE</div>
            <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase mt-[0.5vh]">Admin Project</div>
            <div className="text-[0.9vw] text-muted mt-[0.6vh] leading-snug">BAST &amp; invoice diunggah</div>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[1vw] z-10">07</div>
            <div className="font-display font-semibold text-[1.25vw] mt-[2.2vh]">CLOSED + CSAT</div>
            <div className="font-mono text-[0.75vw] text-primary tracking-widest uppercase mt-[0.5vh]">Otomatis</div>
            <div className="text-[0.9vw] text-muted mt-[0.6vh] leading-snug">Survei kepuasan terkirim ke klien</div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        06 / 10
      </div>
    </div>
  );
}
