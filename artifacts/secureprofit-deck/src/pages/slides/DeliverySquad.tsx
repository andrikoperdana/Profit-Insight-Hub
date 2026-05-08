export default function DeliverySquad() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        04 / Tim Eksekusi
      </div>

      <div className="pt-[7vh] max-w-[72vw]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1] tracking-tight text-wrap-balance">
          Yang turun langsung
          <span className="text-primary"> ke proyek klien.</span>
        </h2>
        <p className="mt-[2vh] text-[1.25vw] text-muted max-w-[60vw] leading-relaxed">
          Tiga peran lapangan bertanggung jawab atas pengerjaan teknis, pelaporan,
          dan dukungan administratif harian.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-3 gap-[1.6vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.6vw]">Konsultan</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Security Consultant
          </div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            konsultan@secureprofit.id<br/>konsultan2@secureprofit.id
          </div>
          <div className="border-t border-border my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Eksekusi pentest, audit, atau VA pada proyek yang ditugaskan</li>
            <li>· Catat timesheet harian (DRAFT → SUBMITTED) untuk diapprove PM</li>
            <li>· Kerjakan task yang dibuat PM, log jam clock-in</li>
            <li>· Maks. 2 proyek aktif paralel</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.6vw]">Technical Writer</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Reporting
          </div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            writer@secureprofit.id — Ayu Wulandari
          </div>
          <div className="border-t border-border my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Susun laporan teknis dan eksekutif dari temuan konsultan</li>
            <li>· Catat timesheet penulisan untuk approval PM</li>
            <li>· Upload draft REPORT &amp; OTHER document ke proyek</li>
            <li>· Bisa kerja paralel di banyak proyek</li>
          </ul>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.6vw]">Admin Project</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Closing &amp; Invoice
          </div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            admin@secureprofit.id — Tono Setiawan
          </div>
          <div className="border-t border-border my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Upload kontrak &amp; SPK pada awal proyek</li>
            <li>· Generate BAST &amp; INVOICE saat proyek selesai</li>
            <li>· Inbox dokumen-closing dengan alert &gt;3 hari complete</li>
            <li>· Tidak menulis kode — fokus dokumen &amp; sirkulasi</li>
          </ul>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        04 / 10
      </div>
    </div>
  );
}
