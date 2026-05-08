export default function StageClose() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        09 / Tahap C — Closing &amp; CSAT
      </div>

      <div className="pt-[7vh] max-w-[74vw]">
        <h2 className="font-display font-bold text-[4vw] leading-[1] tracking-tight text-wrap-balance">
          BAST, invoice, dan
          <span className="text-primary"> survei kepuasan otomatis.</span>
        </h2>
        <p className="mt-[2vh] text-[1.2vw] text-muted max-w-[62vw] leading-relaxed">
          Saat semua deliverable selesai, PM ubah status ke COMPLETE. Admin Project
          merapikan dokumen. Saat status menjadi CLOSED, sistem mengirim CSAT
          tanpa perlu klik manual.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-4 gap-[1.4vw]">
        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.4vh]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[0.95vw]">01</div>
          <div className="font-display font-semibold text-[1.4vw] mt-[1.5vh]">PM tutup proyek</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.5vh]">Project Manager</div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            Status diubah ke COMPLETE setelah deliverable disepakati klien.
          </div>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.4vh]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[0.95vw]">02</div>
          <div className="font-display font-semibold text-[1.4vw] mt-[1.5vh]">Admin upload BAST</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.5vh]">Admin Project</div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            Inbox closing-doc memberi alert &gt;3 hari complete.
            BAST &amp; INVOICE diunggah ke tab Documents.
          </div>
        </div>

        <div className="border border-border bg-bg-elevated/40 px-[1.4vw] py-[2.4vh]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[0.95vw]">03</div>
          <div className="font-display font-semibold text-[1.4vw] mt-[1.5vh]">PM set CLOSED</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.5vh]">Project Manager</div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            Setelah BAST &amp; invoice tersedia, status pindah ke CLOSED — proyek
            terkunci dari edit.
          </div>
        </div>

        <div className="border border-primary/40 bg-primary/10 px-[1.4vw] py-[2.4vh]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary text-bg flex items-center justify-center font-mono font-bold text-[0.95vw]">04</div>
          <div className="font-display font-semibold text-[1.4vw] mt-[1.5vh]">CSAT terkirim otomatis</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.5vh]">Sistem</div>
          <div className="text-[0.95vw] text-muted mt-[1.2vh] leading-snug">
            Trigger pada transisi → CLOSED. Survei kepuasan dikirim ke kontak
            klien. Hasil masuk ke dashboard Management.
          </div>
        </div>
      </div>

      <div className="mt-[4vh] grid grid-cols-2 gap-[2vw]">
        <div className="border-l-[0.25vw] border-primary pl-[1.5vw]">
          <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.6vh]">
            Audit log
          </div>
          <div className="text-[1.05vw] text-text leading-snug">
            Setiap transisi tercatat — siapa mengubah, kapan, nilai sebelum &amp;
            sesudah. Site Admin punya akses penuh untuk investigasi.
          </div>
        </div>
        <div className="border-l-[0.25vw] border-primary pl-[1.5vw]">
          <div className="font-mono text-[0.85vw] text-primary tracking-widest uppercase mb-[0.6vh]">
            Skor CSAT
          </div>
          <div className="text-[1.05vw] text-text leading-snug">
            Hasil survei terhubung ke ID proyek, jadi PMO bisa membandingkan
            kepuasan klien per PM, per layanan, atau per principal.
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        09 / 10
      </div>
    </div>
  );
}
