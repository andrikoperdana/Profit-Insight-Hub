export default function StrategyOps() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        03 / Strategi &amp; Operasi
      </div>

      <div className="pt-[7vh] max-w-[70vw]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1] tracking-tight text-wrap-balance">
          Yang menentukan
          <span className="text-primary"> arah dan aturan main.</span>
        </h2>
        <p className="mt-[2vh] text-[1.25vw] text-muted max-w-[58vw] leading-relaxed">
          PMO, PM, Sales, dan Site Admin membentuk tulang punggung komersial &amp;
          governance — sebelum konsultan menyentuh proyek.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-2 gap-[2vw]">
        <div className="border border-border bg-bg-elevated/40 px-[2vw] py-[3vh]">
          <div className="flex items-baseline justify-between mb-[1.5vh]">
            <div className="font-display font-semibold text-[1.7vw]">PMO Director</div>
            <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Management</div>
          </div>
          <div className="text-[1vw] text-muted mb-[1.5vh] leading-snug">
            management@secureprofit.id — Adi Wibowo
          </div>
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Lihat seluruh portofolio &amp; KPI eksekutif</li>
            <li>· Assign PM ke proyek DRAFT yang dibuat Sales</li>
            <li>· Pantau load PM (PMAllocationCard) dan margin proyek</li>
            <li>· Override field manapun, akses penuh BI &amp; finansial</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[2vw] py-[3vh]">
          <div className="flex items-baseline justify-between mb-[1.5vh]">
            <div className="font-display font-semibold text-[1.7vw]">Project Manager</div>
            <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">PM</div>
          </div>
          <div className="text-[1vw] text-muted mb-[1.5vh] leading-snug">
            pm@secureprofit.id — Sari Pratiwi
          </div>
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Lengkapi detail proyek (jadwal, revenue, mandays, biaya)</li>
            <li>· Setujui / tolak timesheet konsultan &amp; writer</li>
            <li>· Buat task, atur resource, catat expense tambahan</li>
            <li>· Inbox approval di dashboard, "Approve All" sekali klik</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[2vw] py-[3vh]">
          <div className="flex items-baseline justify-between mb-[1.5vh]">
            <div className="font-display font-semibold text-[1.7vw]">Sales</div>
            <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Komersial</div>
          </div>
          <div className="text-[1vw] text-muted mb-[1.5vh] leading-snug">
            sales@secureprofit.id — Budi Santoso
          </div>
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Buat klien baru &amp; intake proyek (form 4 field)</li>
            <li>· Pantau pipeline pribadi, revenue per klien</li>
            <li>· Edit nilai kontrak/SPK selama proyek belum closed</li>
            <li>· Tidak melihat margin/cost — fokus pada revenue</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[2vw] py-[3vh]">
          <div className="flex items-baseline justify-between mb-[1.5vh]">
            <div className="font-display font-semibold text-[1.7vw]">Site Admin</div>
            <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase">Sistem</div>
          </div>
          <div className="text-[1vw] text-muted mb-[1.5vh] leading-snug">
            siteadmin@secureprofit.id — Rina Kartika
          </div>
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Kelola user (buat, nonaktifkan, ubah role)</li>
            <li>· Akses penuh audit log untuk investigasi</li>
            <li>· Tidak ikut campur konten proyek atau finansial</li>
            <li>· Satu-satunya peran dengan akses administrasi user</li>
          </ul>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        03 / 10
      </div>
    </div>
  );
}
