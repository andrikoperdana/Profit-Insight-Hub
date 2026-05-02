const base = import.meta.env.BASE_URL;

export default function Title() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <img
        src={`${base}hero.png`}
        crossOrigin="anonymous"
        alt="Cyber-security data visualization"
        className="absolute inset-0 w-full h-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/95 via-transparent to-bg/40" />

      <div className="relative h-full flex flex-col justify-between px-[8vw] py-[7vh]">
        <div className="flex items-center gap-[1.2vw]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-md bg-primary flex items-center justify-center">
            <div className="w-[1.1vw] h-[1.1vw] border-[0.25vw] border-bg rounded-sm" />
          </div>
          <span className="font-mono text-[1.1vw] tracking-[0.25em] text-text uppercase">
            SecureProfit Hub
          </span>
        </div>

        <div className="max-w-[68vw]">
          <div className="font-mono text-[1vw] tracking-[0.3em] text-primary uppercase mb-[3vh]">
            Product Overview · v1.0
          </div>
          <h1 className="font-display font-bold text-[6.4vw] leading-[0.95] tracking-tight text-text text-wrap-balance">
            Project &amp; profitability OS
            <span className="block text-primary">for security consulting.</span>
          </h1>
          <p className="mt-[3.5vh] text-[1.7vw] text-muted max-w-[55vw] leading-snug">
            One workspace where projects, people, and profit move in sync — built for
            Indonesian IT security consulting firms.
          </p>
        </div>

        <div className="flex items-end justify-between">
          <div className="font-mono text-[0.95vw] text-muted tracking-widest uppercase">
            Jakarta · 2026
          </div>
          <div className="font-mono text-[0.95vw] text-muted tracking-widest">
            01 / 08
          </div>
        </div>
      </div>
    </div>
  );
}
