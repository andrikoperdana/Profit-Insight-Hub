export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-0 right-0 w-[40vw] h-[40vw] rounded-full bg-accent/5 blur-[8vw]" />

      <div className="relative h-full grid grid-cols-12 gap-[3vw] px-[8vw] py-[10vh]">
        <div className="col-span-5 flex flex-col justify-between">
          <div>
            <p className="font-body text-accent text-[1.1vw] tracking-[0.3em] uppercase mb-[2vh]">
              01 — Masalah
            </p>
            <h2 className="font-display font-bold text-[4.6vw] leading-[1] tracking-tight text-text text-balance">
              Pentest manual itu mahal, lambat, dan tidak konsisten.
            </h2>
          </div>
          <p className="font-body text-muted text-[1.3vw] leading-relaxed max-w-[28vw]">
            Tim keamanan harus menunggu berminggu-minggu untuk
            laporan, dengan format yang berbeda-beda tiap vendor.
          </p>
        </div>

        <div className="col-span-7 flex flex-col justify-center gap-[3vh]">
          <div className="border-l-2 border-accent pl-[2vw]">
            <p className="font-display font-bold text-[3.6vw] text-text leading-none">
              4–6 minggu
            </p>
            <p className="font-body text-muted text-[1.2vw] mt-[1vh]">
              waktu tunggu rata-rata dari kickoff sampai laporan akhir
            </p>
          </div>
          <div className="border-l-2 border-accent pl-[2vw]">
            <p className="font-display font-bold text-[3.6vw] text-text leading-none">
              60–80%
            </p>
            <p className="font-body text-muted text-[1.2vw] mt-[1vh]">
              biaya engagement habis untuk pekerjaan repetitif yang bisa diotomasi
            </p>
          </div>
          <div className="border-l-2 border-accent pl-[2vw]">
            <p className="font-display font-bold text-[3.6vw] text-text leading-none">
              Tidak ada jejak
            </p>
            <p className="font-body text-muted text-[1.2vw] mt-[1vh]">
              bukti retest, perubahan severity, atau histori finding antar laporan
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
