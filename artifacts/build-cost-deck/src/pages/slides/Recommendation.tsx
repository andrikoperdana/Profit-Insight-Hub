export default function Recommendation() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-primary text-bg font-body">
      <div className="absolute top-0 right-0 w-[40vw] h-[40vw] bg-accent/15 rounded-full -translate-y-1/3 translate-x-1/3" />
      <div className="absolute bottom-[12vh] left-[7vw] w-[3vw] h-[3vw] border-[0.35vw] border-accent" />

      <div className="relative h-full px-[7vw] py-[7vh] grid grid-cols-12 gap-[3vw]">
        <div className="col-span-5 flex flex-col justify-between">
          <div>
            <div className="font-mono text-[0.9vw] text-accent tracking-[0.3em] uppercase">
              09 &middot; Rekomendasi
            </div>
            <h2 className="mt-[3vh] font-display font-bold text-[4.5vw] leading-[0.95] tracking-tight [text-wrap:balance]">
              Mulai dari MVP,
              <span className="block text-accent">rilis bertahap.</span>
            </h2>
          </div>

          <div className="space-y-[1.5vh]">
            <div className="font-mono text-[0.85vw] tracking-widest text-accent uppercase">
              Kontak &amp; Tindak Lanjut
            </div>
            <p className="text-[1.1vw] opacity-80 leading-snug max-w-[28vw]">
              Diskusi lanjutan dapat dijadwalkan dengan PMO untuk menentukan
              skenario eksekusi yang paling sesuai dengan anggaran dan timeline.
            </p>
          </div>
        </div>

        <div className="col-span-7 flex flex-col justify-center space-y-[2.5vh]">
          <div className="bg-bg/10 border border-bg/20 px-[2vw] py-[2.4vh]">
            <div className="flex items-baseline gap-[1.5vw]">
              <span className="font-display font-bold text-[2.4vw] text-accent">A.</span>
              <div>
                <div className="font-display font-bold text-[1.6vw]">Skenario MVP &mdash; 3 bulan</div>
                <p className="text-[1.05vw] opacity-85 mt-[0.6vh] leading-snug">
                  Auth + Project + Timesheet + 1 dashboard per role. Estimasi
                  Rp 280&ndash;420 juta. Cocok untuk validasi adopsi.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-bg/10 border border-bg/20 px-[2vw] py-[2.4vh]">
            <div className="flex items-baseline gap-[1.5vw]">
              <span className="font-display font-bold text-[2.4vw] text-accent">B.</span>
              <div>
                <div className="font-display font-bold text-[1.6vw]">Skenario Penuh Manual &mdash; 5&ndash;6 bulan</div>
                <p className="text-[1.05vw] opacity-85 mt-[0.6vh] leading-snug">
                  Tim 5 orang, semua fitur. Estimasi Rp 525&ndash;900 juta.
                  Skenario baseline tanpa AI.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-accent text-primary px-[2vw] py-[2.4vh]">
            <div className="flex items-baseline gap-[1.5vw]">
              <span className="font-display font-bold text-[2.4vw]">C.</span>
              <div>
                <div className="font-display font-bold text-[1.6vw]">Skenario AI-Assisted &mdash; 3&ndash;3,5 bulan</div>
                <p className="text-[1.05vw] opacity-90 mt-[0.6vh] leading-snug">
                  Tim 2&ndash;3 orang dengan Replit / AI. Estimasi
                  Rp 200&ndash;350 juta. Direkomendasikan untuk efisiensi
                  maksimal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[7vw] font-mono text-[0.9vw] opacity-60 tracking-widest">
        09 / 09
      </div>
    </div>
  );
}
