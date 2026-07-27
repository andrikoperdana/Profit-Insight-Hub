import React from 'react';
import "./_group.css";
import {
  FileText,
  ChevronRight,
  LayoutDashboard,
  Briefcase,
  Users,
  Clock,
  DollarSign,
  Settings,
  Bell,
  Search,
  Sparkles,
  RefreshCw,
  Download,
  ShieldCheck,
  CheckSquare,
  Activity,
  AlertTriangle,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link as LinkIcon,
  Save
} from "lucide-react";

// --- Minimal Reusable UI Components ---

const Card = ({ className = "", children }: { className?: string, children: React.ReactNode }) => (
  <div className={`bg-card border border-border rounded-lg shadow-sm ${className}`}>{children}</div>
);

const CardHeader = ({ className = "", children }: { className?: string, children: React.ReactNode }) => (
  <div className={`p-5 border-b border-border ${className}`}>{children}</div>
);

const CardTitle = ({ className = "", children }: { className?: string, children: React.ReactNode }) => (
  <h3 className={`font-semibold tracking-tight text-foreground ${className}`}>{children}</h3>
);

const CardContent = ({ className = "", children }: { className?: string, children: React.ReactNode }) => (
  <div className={`p-5 ${className}`}>{children}</div>
);

const Badge = ({ className = "", children, variant = "default" }: { className?: string, children: React.ReactNode, variant?: "default" | "outline" | "success" }) => {
  const base = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground",
    outline: "text-foreground border-border",
    success: "border-transparent bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]"
  };
  return <div className={`${base} ${variants[variant]} ${className}`}>{children}</div>;
};

const Button = ({ className = "", variant = "default", size = "default", children }: { className?: string, variant?: "default" | "outline" | "ghost", size?: "default" | "sm" | "icon", children: React.ReactNode }) => {
  const base = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-border bg-background hover:bg-muted text-foreground",
    ghost: "hover:bg-muted text-foreground",
  };
  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    icon: "h-10 w-10",
  };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>{children}</button>;
};

const NavItem = ({ icon: Icon, label, active }: { icon: any, label: string, active?: boolean }) => (
  <button className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}>
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

// --- Main Page Component ---

export function DraftLaporan() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground flex font-sans selection:bg-primary/30">
      
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-border flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-wide">
            <ShieldCheck className="w-6 h-6" />
            SECUREPROFIT
          </div>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          <NavItem icon={LayoutDashboard} label="Dashboard" />
          <NavItem icon={Briefcase} label="Proyek" />
          <NavItem icon={Users} label="Klien" />
          <NavItem icon={Clock} label="Timesheet" />
          <NavItem icon={FileText} label="Laporan" active />
          <NavItem icon={DollarSign} label="Keuangan" />
        </nav>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">BS</div>
            <div>
              <p className="text-sm font-medium">Budi Santoso</p>
              <p className="text-xs text-muted-foreground">budi@itsec.id</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen">
        
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-2 w-1/3">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Cari proyek atau laporan..." 
                className="w-full bg-input border border-border rounded-md pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground" 
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-muted-foreground hover:text-foreground relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full ring-2 ring-background"></span>
            </button>
            <button className="text-muted-foreground hover:text-foreground">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Page Header */}
            <div>
              <div className="flex items-center text-sm text-muted-foreground mb-3">
                <span className="hover:text-foreground cursor-pointer transition-colors">Proyek</span>
                <ChevronRight className="w-4 h-4 mx-1" />
                <span className="hover:text-foreground cursor-pointer transition-colors">Bank Nusantara</span>
                <ChevronRight className="w-4 h-4 mx-1" />
                <span className="text-foreground font-medium">Laporan Bulanan</span>
              </div>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">Draf Laporan: Juli 2026</h1>
                  <div className="flex items-center gap-4 mt-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Pentest Mobile Banking</Badge>
                    <span className="flex items-center text-sm font-medium text-[hsl(var(--success))]">
                      <ShieldCheck className="w-4 h-4 mr-1.5" /> 
                      Status: Berjalan
                    </span>
                    <span className="flex items-center text-sm text-muted-foreground">
                      <Users className="w-4 h-4 mr-1.5" /> 
                      PM: Budi Santoso
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Ekspor PDF
                  </Button>
                </div>
              </div>
            </div>

            {/* AI Banner */}
            <div className="bg-gradient-to-r from-primary/10 to-background border border-border border-l-4 border-l-primary rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center gap-5 shadow-sm">
              <div className="p-2.5 bg-primary/20 rounded-md shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-primary">Draf berhasil disusun oleh SecureProfit AI</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Draf ini disintesis secara otomatis berdasarkan agregasi data operasional bulan Juli 2026. Lakukan peninjauan dan penyesuaian teks jika diperlukan sebelum menyimpannya ke pangkalan data proyek.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 mt-4 md:mt-0">
                <Button variant="outline" size="sm" className="bg-background">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Buat Ulang
                </Button>
                <Button size="sm" className="shadow-lg shadow-primary/20">
                  <Save className="w-4 h-4 mr-2" />
                  Simpan Draf
                </Button>
              </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-12 gap-6 items-start">
              
              {/* Document Editor Area */}
              <div className="col-span-12 lg:col-span-8 flex flex-col h-[650px] bg-card border border-border rounded-lg shadow-sm overflow-hidden relative">
                
                {/* Editor Toolbar */}
                <div className="h-12 border-b border-border bg-muted/20 flex items-center px-3 gap-2 shrink-0">
                  <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer text-sm font-medium text-foreground transition-colors">
                    Teks Normal
                    <ChevronRight className="w-3 h-3 rotate-90 text-muted-foreground" />
                  </div>
                  <div className="w-px h-5 bg-border mx-1"></div>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 text-foreground bg-muted rounded shadow-sm"><Bold className="w-4 h-4" /></button>
                    <button className="p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded transition-colors"><Italic className="w-4 h-4" /></button>
                    <button className="p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded transition-colors"><Underline className="w-4 h-4" /></button>
                  </div>
                  <div className="w-px h-5 bg-border mx-1"></div>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 text-foreground bg-muted rounded shadow-sm"><AlignLeft className="w-4 h-4" /></button>
                    <button className="p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded transition-colors"><AlignCenter className="w-4 h-4" /></button>
                    <button className="p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded transition-colors"><AlignRight className="w-4 h-4" /></button>
                  </div>
                  <div className="w-px h-5 bg-border mx-1"></div>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded transition-colors"><List className="w-4 h-4" /></button>
                    <button className="p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded transition-colors"><ListOrdered className="w-4 h-4" /></button>
                  </div>
                  <div className="w-px h-5 bg-border mx-1"></div>
                  <button className="p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded transition-colors"><LinkIcon className="w-4 h-4" /></button>
                </div>
                
                {/* Editor Content (Simulated WYSIWYG) */}
                <div className="flex-1 overflow-auto p-8 md:p-10 text-[15px] leading-relaxed text-foreground space-y-8 bg-background/50 focus:outline-none" contentEditable suppressContentEditableWarning>
                  
                  {/* Document Title */}
                  <div className="text-center mb-12">
                    <h1 className="text-2xl font-bold uppercase tracking-widest text-foreground">Laporan Kemajuan Proyek</h1>
                    <p className="text-muted-foreground mt-2 font-medium">Periode: Juli 2026</p>
                  </div>

                  <section>
                    <h2 className="text-lg font-semibold mb-3 text-primary border-b border-border pb-2">1. Ringkasan Eksekutif</h2>
                    <p className="text-muted-foreground text-justify">
                      Sepanjang bulan Juli 2026, proyek <strong className="text-foreground font-semibold">Pentest Mobile Banking</strong> untuk <strong className="text-foreground font-semibold">Bank Nusantara</strong> berjalan sesuai dengan jadwal yang ditetapkan. Hingga saat ini, progres keseluruhan telah mencapai <strong className="text-foreground font-semibold">75%</strong>. Tim telah menyelesaikan fase <em className="text-foreground not-italic font-medium">Reconnaissance</em> dan <em className="text-foreground not-italic font-medium">Exploitation</em> pada aplikasi iOS dan Android tanpa hambatan kritis. Target waktu penyelesaian proyek pada pertengahan Agustus 2026 diproyeksikan akan tercapai.
                    </p>
                  </section>

                  <section>
                    <h2 className="text-lg font-semibold mb-3 text-primary border-b border-border pb-2">2. Pencapaian Bulan Ini</h2>
                    <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                      <li>Penyelesaian fase <em className="text-foreground not-italic font-medium">Reconnaissance</em> dengan temuan awal 12 kerentanan berisiko rendah pada infrastruktur API.</li>
                      <li>Pelaksanaan pengujian <em className="text-foreground not-italic font-medium">Exploitation</em> pada environment staging yang menghasilkan 3 temuan kritikal terkait mekanisme otentikasi biometrik dan bypass PIN.</li>
                      <li>Penyampaian Laporan Interim kepada tim IT Security Bank Nusantara untuk tindakan perbaikan segera (hotfix).</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-lg font-semibold mb-3 text-primary border-b border-border pb-2">3. Penggunaan Sumber Daya & Keuangan</h2>
                    <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                      <li><strong className="text-foreground font-semibold">Jam Kerja:</strong> 320 jam terpakai dari total alokasi 400 jam (<strong className="text-foreground font-semibold">80% utilisasi</strong>). Distribusi optimal antara Senior Pentester dan Analis Keamanan.</li>
                      <li><strong className="text-foreground font-semibold">Status Tagihan:</strong> Termin 1 sebesar <strong className="text-foreground font-semibold">Rp 1.250.000.000</strong> telah terbayar lunas pada tanggal 15 Juli 2026.</li>
                      <li><strong className="text-foreground font-semibold">Margin Proyek:</strong> Saat ini berjalan pada perkiraan <strong className="text-[hsl(var(--success))] font-semibold">42%</strong>, melebihi target dasar margin perusahaan (40%).</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-lg font-semibold mb-3 text-primary border-b border-border pb-2">4. Kendala & Risiko (RAID)</h2>
                    <p className="text-muted-foreground text-justify mb-3">
                      Satu risiko utama tercatat terkait keterlambatan pemberian akses ke API pembayaran pihak ketiga dari sisi klien, yang menyebabkan pengujian tertunda selama 3 hari kerja. 
                    </p>
                    <div className="bg-muted/40 border border-border p-4 rounded-md">
                      <p className="text-sm leading-relaxed text-muted-foreground"><strong className="text-[hsl(var(--warning))] font-semibold">Tindakan Mitigasi:</strong> Telah dilakukan eskalasi ke Manajer Proyek Bank Nusantara pada tanggal 10 Juli 2026. Akses sementara akhirnya diberikan melalui VPN staging pada keesokan harinya. Jadwal pengujian telah disesuaikan dengan penambahan lembur tanpa mengurangi kualitas hasil, sehingga timeline keseluruhan proyek tidak terpengaruh.</p>
                    </div>
                  </section>

                  <section>
                    <h2 className="text-lg font-semibold mb-3 text-primary border-b border-border pb-2">5. Rencana Bulan Depan</h2>
                    <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                      <li>Memulai fase <em className="text-foreground not-italic font-medium">Post-Exploitation</em> dan validasi perbaikan kerentanan dari tim Bank Nusantara.</li>
                      <li>Penyusunan Laporan Akhir komprehensif, mencakup rincian teknis dan rekomendasi arsitektur strategis.</li>
                      <li>Presentasi hasil akhir (Executive Summary) ke jajaran Direksi dan CISO Bank Nusantara pada minggu kedua Agustus.</li>
                    </ul>
                  </section>

                  {/* Spacer for comfortable scrolling */}
                  <div className="h-8"></div>
                </div>
              </div>

              {/* Data Source Sidebar */}
              <div className="col-span-12 lg:col-span-4 space-y-6">
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      Jejak Analisis Data AI
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    
                    <div className="flex gap-4">
                      <div className="w-9 h-9 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">320 Jam Timesheet</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Terdiri dari 120 jam (Senior Pentester) dan 200 jam (Analis). 80% utilisasi dari budget bulan ini.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-9 h-9 rounded-md bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/20 flex items-center justify-center shrink-0">
                        <CheckSquare className="w-4 h-4 text-[hsl(var(--success))]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">2 Milestone Selesai</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Fase Reconnaissance & Fase Exploitation (Staging) ditandai selesai pada sistem.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-9 h-9 rounded-md bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/20 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">1 Risiko & Masalah</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Keterlambatan akses API pembayaran. Status saat ini: Dimitigasi.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <DollarSign className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">1 Tagihan Lunas</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Invoice Termin 1 senilai Rp 1.250.000.000 dibayar pada 15 Juli 2026.</p>
                      </div>
                    </div>

                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Settings className="w-4 h-4 text-muted-foreground" />
                      Parameter Generasi
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Nada Penulisan</p>
                        <p className="text-sm font-medium text-foreground">Profesional Konsultan</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Bahasa</p>
                        <p className="text-sm font-medium text-foreground">Indonesia Dasar</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Kedalaman</p>
                        <p className="text-sm font-medium text-foreground">Ringkasan Eksekutif</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Fokus</p>
                        <p className="text-sm font-medium text-foreground">Progres & Temuan</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
