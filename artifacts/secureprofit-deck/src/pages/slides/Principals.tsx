export default function Principals() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[8vw] py-[7vh]">
      <div className="absolute top-0 left-[8vw] w-[0.25vw] h-[6vh] bg-primary" />
      <div className="absolute top-[6vh] left-[8vw] font-mono text-[0.95vw] tracking-[0.3em] text-primary uppercase">
        05 / Principal Supervisor
      </div>

      <div className="pt-[7vh] max-w-[72vw]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1] tracking-tight text-wrap-balance">
          Tiga supervisor
          <span className="text-primary"> menjaga kualitas SDM.</span>
        </h2>
        <p className="mt-[2vh] text-[1.25vw] text-muted max-w-[60vw] leading-relaxed">
          Principal mengawasi keahlian dan beban kerja anggota timnya, lalu
          mengusulkan / menugaskan SDM ke proyek. PM tetap memegang keputusan akhir.
        </p>
      </div>

      <div className="mt-[5vh] grid grid-cols-3 gap-[1.6vw]">
        <div className="border border-primary/40 bg-primary/5 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.55vw]">Principal Konsultan</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Bayu Prasetyo
          </div>
          <div className="text-[0.9vw] text-muted mt-[0.8vh] leading-snug">
            principal.kon.h7q4@itsecasia.com
          </div>
          <div className="border-t border-primary/30 my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Mengawasi semua Konsultan</li>
            <li>· <span className="text-primary">Mengusulkan</span> konsultan ke proyek (PM accept)</li>
            <li>· Lihat dashboard "Proyek butuh konsultan"</li>
            <li>· Tidak melihat angka komersial / margin</li>
          </ul>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.55vw]">Principal Tech Writer</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Indah Kusumawardani
          </div>
          <div className="text-[0.9vw] text-muted mt-[0.8vh] leading-snug">
            principal.tw.m9k2@itsecasia.com
          </div>
          <div className="border-t border-primary/30 my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Mengawasi semua Technical Writer</li>
            <li>· <span className="text-primary">Langsung menugaskan</span> 1 writer per proyek</li>
            <li>· Pastikan kapasitas penulisan terdistribusi</li>
            <li>· Tidak melihat angka komersial / margin</li>
          </ul>
        </div>

        <div className="border border-primary/40 bg-primary/5 px-[1.5vw] py-[2.6vh]">
          <div className="font-display font-semibold text-[1.55vw]">Principal Admin Project</div>
          <div className="font-mono text-[0.8vw] text-primary tracking-widest uppercase mt-[0.4vh]">
            Fajar Nugroho
          </div>
          <div className="text-[0.9vw] text-muted mt-[0.8vh] leading-snug">
            principal.ap.r3n8@itsecasia.com
          </div>
          <div className="border-t border-primary/30 my-[2vh]" />
          <ul className="text-[1vw] text-text leading-relaxed space-y-[0.6vh]">
            <li>· Mengawasi semua Admin Project</li>
            <li>· <span className="text-primary">Langsung menugaskan</span> 1 admin per proyek</li>
            <li>· Pastikan setiap proyek punya admin closing</li>
            <li>· Tidak melihat angka komersial / margin</li>
          </ul>
        </div>
      </div>

      <div className="mt-[4vh] border-t border-border pt-[2vh] flex items-center gap-[1vw] max-w-[80vw]">
        <span className="font-mono text-primary text-[1vw]">i</span>
        <span className="text-[1vw] text-muted leading-snug">
          Principal Konsultan memakai mekanisme <span className="text-text">propose → accept</span>
          karena 1 proyek bisa butuh banyak konsultan; Principal TW dan AP langsung
          menunjuk karena hanya 1 orang per proyek.
        </span>
      </div>

      <div className="absolute bottom-[4vh] right-[8vw] font-mono text-[0.95vw] text-muted tracking-widest">
        05 / 10
      </div>
    </div>
  );
}
