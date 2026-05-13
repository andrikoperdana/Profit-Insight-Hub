export default function Infrastructure() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body px-[7vw] py-[7vh]">
      <div className="absolute top-[7vh] left-[7vw] w-[0.3vw] h-[5vh] bg-accent" />
      <div className="absolute top-[7vh] left-[8vw] font-mono text-[0.9vw] tracking-[0.3em] text-accent uppercase">
        06 &middot; Infrastruktur &amp; Tools
      </div>

      <div className="pt-[8vh] max-w-[78vw]">
        <h2 className="font-display font-bold text-[3.4vw] leading-[1.05] tracking-tight text-primary">
          Pengeluaran bulanan modest, tapi wajib direncanakan dari hari pertama.
        </h2>
      </div>

      <div className="mt-[5vh] grid grid-cols-2 gap-[3vw]">
        <div>
          <div className="font-mono text-[0.85vw] text-accent tracking-widest uppercase mb-[2vh]">
            Hosting &amp; Database
          </div>
          <div className="border-t border-border">
            <div className="grid grid-cols-2 py-[1.4vh] border-b border-border">
              <span className="text-[1.05vw] text-text">Cloud VPS (staging + prod)</span>
              <span className="font-mono text-[1.05vw] text-muted text-right">Rp 500 rb &ndash; 2 jt</span>
            </div>
            <div className="grid grid-cols-2 py-[1.4vh] border-b border-border">
              <span className="text-[1.05vw] text-text">PostgreSQL managed</span>
              <span className="font-mono text-[1.05vw] text-muted text-right">Rp 300 rb &ndash; 1,5 jt</span>
            </div>
            <div className="grid grid-cols-2 py-[1.4vh] border-b border-border">
              <span className="text-[1.05vw] text-text">Domain + SSL</span>
              <span className="font-mono text-[1.05vw] text-muted text-right">Rp 200 rb / tahun</span>
            </div>
            <div className="grid grid-cols-2 py-[1.4vh] border-b border-border">
              <span className="text-[1.05vw] text-text">Backup storage (S3/GCS)</span>
              <span className="font-mono text-[1.05vw] text-muted text-right">Rp 100 &ndash; 500 rb</span>
            </div>
          </div>
        </div>

        <div>
          <div className="font-mono text-[0.85vw] text-accent tracking-widest uppercase mb-[2vh]">
            Operasional &amp; Tools
          </div>
          <div className="border-t border-border">
            <div className="grid grid-cols-2 py-[1.4vh] border-b border-border">
              <span className="text-[1.05vw] text-text">CI/CD (GitHub Actions)</span>
              <span className="font-mono text-[1.05vw] text-muted text-right">Rp 0 (free tier)</span>
            </div>
            <div className="grid grid-cols-2 py-[1.4vh] border-b border-border">
              <span className="text-[1.05vw] text-text">Repo private (GitHub/GitLab)</span>
              <span className="font-mono text-[1.05vw] text-muted text-right">Rp 0 &ndash; 60 rb / user</span>
            </div>
            <div className="grid grid-cols-2 py-[1.4vh] border-b border-border">
              <span className="text-[1.05vw] text-text">Monitoring (Sentry, Uptime)</span>
              <span className="font-mono text-[1.05vw] text-muted text-right">Rp 0 &ndash; 500 rb</span>
            </div>
            <div className="grid grid-cols-2 py-[1.4vh] border-b border-border">
              <span className="text-[1.05vw] text-text">Email (SendGrid/Mailgun)</span>
              <span className="font-mono text-[1.05vw] text-muted text-right">Rp 0 &ndash; 300 rb</span>
            </div>
            <div className="grid grid-cols-2 py-[1.4vh] border-b border-border">
              <span className="text-[1.05vw] text-text">Tools tim (Jira, Figma, Slack)</span>
              <span className="font-mono text-[1.05vw] text-muted text-right">Rp 500 rb &ndash; 2 jt</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-[5vh] bg-primary text-bg px-[2.5vw] py-[2.6vh] grid grid-cols-3 gap-[2vw]">
        <div>
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Total Bulanan
          </div>
          <div className="font-display font-bold text-[2.4vw] mt-[0.8vh] leading-none">
            Rp 1,4 &ndash; 6,5 jt
          </div>
        </div>
        <div>
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Total Infra 5 Bulan
          </div>
          <div className="font-display font-bold text-[2.4vw] mt-[0.8vh] leading-none">
            Rp 5 &ndash; 25 jt
          </div>
        </div>
        <div>
          <div className="font-mono text-[0.78vw] text-accent tracking-widest uppercase">
            Tools &amp; Lisensi
          </div>
          <div className="font-display font-bold text-[2.4vw] mt-[0.8vh] leading-none">
            Rp 5 &ndash; 15 jt
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] right-[7vw] font-mono text-[0.9vw] text-muted tracking-widest">
        06 / 09
      </div>
    </div>
  );
}
