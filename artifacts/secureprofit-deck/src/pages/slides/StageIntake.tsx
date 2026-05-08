export default function StageIntake() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        07 / Tahap A — Intake
      </div>

      <div className="pt-[7vh] max-w-[74vw]">
        <h2 className="font-display font-bold text-[4vw] leading-[1] tracking-tight text-wrap-balance">
          Sales buat proyek, PMO assign PM,
          <span className="text-primary"> PM lengkapi detail.</span>
        </h2>
        <p className="mt-[2vh] text-[1.2vw] text-muted max-w-[62vw] leading-relaxed">
          Tiga handoff awal yang menentukan apakah proyek bisa dieksekusi atau
          tertahan di pipeline.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-3 gap-[1.6vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh] relative">
          <div className="absolute top-[2vh] right-[1.5vw] font-mono text-[0.8vw] text-primary">→</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Langkah 1 · Sales</div>
          <div className="font-display font-semibold text-[1.7vw] mt-[1vh]">Buat DRAFT</div>
          <div className="text-[1vw] text-muted mt-[1.5vh] leading-relaxed">
            Halaman <span className="font-mono text-text">/projects/new</span>:
            isi 4 field — Nama, SPK, Klien, Nilai Kontrak. Klik simpan.
          </div>
          <div className="border-t border-border my-[2vh]" />
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mb-[1vh]">Hasil</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
            <li>· Status proyek: DRAFT</li>
            <li>· Sales jadi pemilik (salesId)</li>
            <li>· PM masih kosong</li>
            <li>· Muncul di dashboard PMO</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh] relative">
          <div className="absolute top-[2vh] right-[1.5vw] font-mono text-[0.8vw] text-primary">→</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Langkah 2 · PMO Director</div>
          <div className="font-display font-semibold text-[1.7vw] mt-[1vh]">Tunjuk PM</div>
          <div className="text-[1vw] text-muted mt-[1.5vh] leading-relaxed">
            Card ungu "Pending PM Assignment" di dashboard. Klik
            <span className="font-mono text-text"> Assign PM</span>, pilih nama
            dari dropdown, simpan.
          </div>
          <div className="border-t border-border my-[2vh]" />
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mb-[1vh]">Hasil</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
            <li>· pmId terisi</li>
            <li>· Proyek pindah ke inbox PM</li>
            <li>· Audit log: project.pm_assigned</li>
            <li>· Status tetap DRAFT</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh]">
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Langkah 3 · Project Manager</div>
          <div className="font-display font-semibold text-[1.7vw] mt-[1vh]">Lengkapi detail</div>
          <div className="text-[1vw] text-muted mt-[1.5vh] leading-relaxed">
            Buka proyek → "DraftCompletionCard" ungu di atas. Isi deskripsi,
            jadwal, revenue, planned mandays, estimated cost.
          </div>
          <div className="border-t border-border my-[2vh]" />
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mb-[1vh]">Hasil</div>
          <ul className="text-[0.95vw] text-text leading-relaxed space-y-[0.5vh]">
            <li>· Status pindah ke OBSERVATION</li>
            <li>· Tim delivery mulai diundang</li>
            <li>· Dashboard finansial aktif</li>
            <li>· Siap masuk fase resourcing</li>
          </ul>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        07 / 10
      </div>
    </div>
  );
}
