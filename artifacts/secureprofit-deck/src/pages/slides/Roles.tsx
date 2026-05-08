export default function Roles() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        02 / Peran
      </div>

      <div className="pt-[7vh]">
        <h2 className="font-display font-bold text-[4.4vw] leading-[1] tracking-tight text-wrap-balance max-w-[72vw]">
          Sepuluh peran yang bekerja
          <span className="text-primary"> di satu platform.</span>
        </h2>
        <p className="mt-[2vh] text-[1.3vw] text-muted max-w-[60vw] leading-relaxed">
          Empat tim eksekusi, tiga Principal supervisor, dua peran komersial &amp;
          governance, satu administrator sistem — masing-masing dengan dashboard
          dan hak akses yang berbeda.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-5 gap-[1.2vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Strategi</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">PMO Director</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Portofolio &amp; assign PM</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Delivery</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Project Manager</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Eksekusi &amp; approve timesheet</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Komersial</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Sales</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Pipeline &amp; intake proyek</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Lapangan</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Konsultan</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Pentest &amp; log mandays</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Lapangan</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Technical Writer</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Laporan &amp; dokumen</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Operasi</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Admin Project</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">BAST, invoice, closing doc</div>
        </div>
        <div className="border border-primary/40 bg-primary/5 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Principal</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Principal Konsultan</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Usulkan konsultan ke PM</div>
        </div>
        <div className="border border-primary/40 bg-primary/5 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Principal</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Principal Tech Writer</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Tunjuk writer ke proyek</div>
        </div>
        <div className="border border-primary/40 bg-primary/5 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Principal</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Principal Admin Project</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Tunjuk admin ke proyek</div>
        </div>
        <div className="border border-border bg-bg-elevated/40 px-[1vw] py-[1.6vh]">
          <div className="font-mono text-[0.7vw] text-primary tracking-widest uppercase">Sistem</div>
          <div className="font-display font-semibold text-[1.15vw] mt-[0.6vh]">Site Admin</div>
          <div className="text-[0.85vw] text-muted mt-[0.3vh] leading-snug">Kelola user &amp; audit log</div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        02 / 10
      </div>
    </div>
  );
}
