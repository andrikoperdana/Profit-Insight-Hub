export default function StageActive() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        08 / Tahap B — Eksekusi
      </div>

      <div className="pt-[7vh] max-w-[74vw]">
        <h2 className="font-display font-bold text-[4vw] leading-[1] tracking-tight text-wrap-balance">
          Resourcing, eksekusi,
          <span className="text-primary"> dan profit yang terhitung harian.</span>
        </h2>
        <p className="mt-[2vh] text-[1.2vw] text-muted max-w-[62vw] leading-relaxed">
          Saat status OBSERVATION → ACTIVE, semua peran lapangan mulai berjalan
          paralel. PM tetap menjadi titik approval.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-12 gap-[1.5vw]">
        <div className="col-span-7 border border-border bg-bg-elevated/40 px-[1.8vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Resourcing</div>
          <div className="font-display font-semibold text-[1.6vw] mt-[0.6vh]">Tim diisi oleh Principal &amp; PM</div>
          <div className="grid grid-cols-3 gap-[1vw] mt-[2vh]">
            <div>
              <div className="font-display font-semibold text-[1.1vw]">Principal Konsultan</div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh] leading-snug">Klik <span className="text-text">Propose Resource</span> di tab Resources. PM klik Accept.</div>
            </div>
            <div>
              <div className="font-display font-semibold text-[1.1vw]">Principal Tech Writer</div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh] leading-snug">Pilih writer dari dropdown di Overview, langsung tertugaskan.</div>
            </div>
            <div>
              <div className="font-display font-semibold text-[1.1vw]">Principal Admin Project</div>
              <div className="text-[0.9vw] text-muted mt-[0.3vh] leading-snug">Pilih admin dari dropdown di Overview, langsung tertugaskan.</div>
            </div>
          </div>
        </div>

        <div className="col-span-5 border border-border bg-bg-elevated/40 px-[1.8vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Project Manager</div>
          <div className="font-display font-semibold text-[1.6vw] mt-[0.6vh]">Buat task harian</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh] mt-[1.5vh]">
            <li>· Tab "Tasks" → assign ke konsultan/writer</li>
            <li>· Status TODO → IN_PROGRESS → DONE</li>
            <li>· Catat expense tambahan di tab "Expenses"</li>
          </ul>
        </div>

        <div className="col-span-5 border border-border bg-bg-elevated/40 px-[1.8vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Konsultan &amp; Writer</div>
          <div className="font-display font-semibold text-[1.6vw] mt-[0.6vh]">Log timesheet harian</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh] mt-[1.5vh]">
            <li>· Tombol "Log Today's Time Sheet" di dashboard</li>
            <li>· Status DRAFT → SUBMITTED untuk approval</li>
            <li>· Bisa clock-in pada task tertentu</li>
          </ul>
        </div>

        <div className="col-span-7 border border-border bg-bg-elevated/40 px-[1.8vw] py-[2.4vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Project Manager</div>
          <div className="font-display font-semibold text-[1.6vw] mt-[0.6vh]">Approve &amp; pantau profit</div>
          <div className="grid grid-cols-2 gap-[1vw] mt-[1.5vh]">
            <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
              <li>· Approve / reject timesheet di inbox</li>
              <li>· "Approve All" sekali klik untuk batch</li>
            </ul>
            <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
              <li>· Tab "Financials" — margin update real-time</li>
              <li>· Alert kalau actualCost mendekati contractValue</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        08 / 10
      </div>
    </div>
  );
}
