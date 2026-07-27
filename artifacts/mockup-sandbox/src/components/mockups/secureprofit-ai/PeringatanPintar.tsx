import React, { useState } from "react";
import {
  Bell,
  Search,
  Settings,
  Sparkles,
  AlertTriangle,
  Info,
  TrendingDown,
  TrendingUp,
  Clock,
  Activity,
  Mail,
  CheckCircle2,
  Briefcase,
  CreditCard,
  BarChart3,
  Power,
  ShieldAlert,
  ChevronRight,
  Menu,
  MoreVertical
} from "lucide-react";
import "./_group.css";

// Types
type Severity = "critical" | "warning" | "info";

interface AlertData {
  id: string;
  severity: Severity;
  category: string;
  time: string;
  title: string;
  aiInsight: React.ReactNode;
  metric?: {
    label: string;
    current: string;
    previous: string;
    delta: string;
    deltaIcon: "down" | "up" | "none";
    deltaColor: "destructive" | "warning" | "success" | "neutral";
  };
  actions: {
    label: string;
    icon?: React.ReactNode;
    primary?: boolean;
    onClick?: () => void;
  }[];
}

// Mock Data
const MOCK_ALERTS: AlertData[] = [
  {
    id: "a1",
    severity: "critical",
    category: "Profitabilitas Proyek",
    time: "1 jam yang lalu",
    title: "Penurunan Margin Signifikan: Pentest Mobile Banking — Bank Nusantara",
    aiInsight: (
      <>
        Margin turun dari 35% ke 18% dalam 3 minggu terakhir. <strong>Penyebab utama:</strong> Alokasi konsultan Senior (Budi Santoso) melebihi estimasi awal akibat temuan kerentanan kritis yang memerlukan eskalasi tambahan di workstream Infrastruktur.
      </>
    ),
    metric: {
      label: "Margin Berjalan",
      current: "18%",
      previous: "Estimasi: 35%",
      delta: "17%",
      deltaIcon: "down",
      deltaColor: "destructive",
    },
    actions: [
      { label: "Lihat Proyek", primary: true },
      { label: "Hubungi PM", icon: <Mail className="w-4 h-4" /> },
    ]
  },
  {
    id: "a2",
    severity: "warning",
    category: "Administrasi & Waktu",
    time: "3 jam yang lalu",
    title: "Persetujuan Timesheet Tertunda: Implementasi SOC — PT Sinar Teknologi",
    aiInsight: (
      <>
        Terdapat 68 jam kerja yang belum disetujui selama 2 periode penagihan berturut-turut. <strong>Penyebab utama:</strong> Manajer Proyek (Andi Wijaya) belum melakukan persetujuan mingguan, berpotensi menunda penerbitan invoice senilai Rp 125.000.000.
      </>
    ),
    metric: {
      label: "Jam Tertunda",
      current: "68 Jam",
      previous: "Batas wajar: 0 Jam",
      delta: "+68j",
      deltaIcon: "up",
      deltaColor: "warning",
    },
    actions: [
      { label: "Ingatkan PM", primary: true, icon: <Bell className="w-4 h-4" /> },
      { label: "Lihat Timesheet" },
    ]
  },
  {
    id: "a3",
    severity: "info",
    category: "Arus Kas & Tagihan",
    time: "Kemarin, 14:30",
    title: "Prediksi Keterlambatan Pembayaran: Audit ISO 27001 — FinPay Indonesia",
    aiInsight: (
      <>
        Invoice #INV-2026-089 senilai Rp 850.000.000 untuk Termin 2 akan jatuh tempo dalam 3 hari. <strong>Prediksi AI:</strong> Berdasarkan riwayat histori pembayaran klien ini, rata-rata penyelesaian membutuhkan waktu tambahan +14 hari dari tanggal jatuh tempo aktual.
      </>
    ),
    metric: {
      label: "Prediksi Jatuh Tempo",
      current: "H+14",
      previous: "Dokumen: H-3",
      delta: "+17 Hari",
      deltaIcon: "up",
      deltaColor: "neutral",
    },
    actions: [
      { label: "Buat Pengingat", primary: true },
      { label: "Eskalasi ke Keuangan" },
    ]
  },
  {
    id: "a4",
    severity: "warning",
    category: "Pembengkakan Biaya",
    time: "Kemarin, 09:15",
    title: "Lonjakan Biaya Cloud: Red Teaming — Bank Mega",
    aiInsight: (
      <>
        Biaya infrastruktur cloud (AWS) naik 15% melampaui anggaran bulanan berjalan. <strong>Penyebab utama:</strong> 4 instansi virtual berkinerja tinggi (GPU) lupa dinonaktifkan setelah pengujian stres (stress testing) akhir pekan lalu.
      </>
    ),
    metric: {
      label: "Biaya Cloud (AWS)",
      current: "Rp 5,2 Jt",
      previous: "Anggaran: Rp 4,5 Jt",
      delta: "15%",
      deltaIcon: "up",
      deltaColor: "destructive",
    },
    actions: [
      { label: "Matikan Instansi", primary: true, icon: <Power className="w-4 h-4" /> },
      { label: "Tinjau Alokasi" },
    ]
  }
];

const NAV_ITEMS = [
  { label: "Dasbor", icon: Activity },
  { label: "Proyek", icon: Briefcase },
  { label: "Timesheet", icon: Clock },
  { label: "Tagihan", icon: CreditCard },
  { label: "Peringatan Pintar", icon: Sparkles, active: true },
  { label: "Laporan", icon: BarChart3 },
];

export function PeringatanPintar() {
  const [alerts, setAlerts] = useState(MOCK_ALERTS);

  const handleDismiss = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex font-sans selection:bg-primary/30">
      
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-sidebar-border bg-sidebar flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sidebar-foreground tracking-tight">SecureProfit</span>
          </div>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Menu Utama</div>
            {NAV_ITEMS.map((item, idx) => (
              <button
                key={idx}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  item.active 
                    ? "bg-sidebar-primary/10 text-sidebar-primary" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.active && (
                  <div className="ml-auto flex h-5 w-5 items-center justify-center">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
        
        <div className="p-4 border-t border-sidebar-border">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors">
            <Settings className="w-4 h-4" />
            Pengaturan Sistem
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navbar */}
        <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-8 bg-background/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground">
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Cari proyek, konsultan, invoice..." 
                className="h-9 w-64 rounded-md border border-input bg-muted/30 pl-9 pr-4 text-sm outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-background" />
            </button>
            <div className="w-px h-6 bg-border hidden sm:block" />
            <button className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent border border-border flex items-center justify-center text-sm font-medium">
                BW
              </div>
              <div className="hidden md:flex flex-col items-start text-left">
                <span className="text-sm font-medium leading-none">Budi Wijaya</span>
                <span className="text-xs text-muted-foreground mt-1">Direktur Operasional</span>
              </div>
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto space-y-8 pb-12">
            
            {/* Page Header */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h1 className="text-2xl font-semibold tracking-tight mb-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Peringatan Pintar
              </h1>
              <p className="text-muted-foreground text-sm max-w-2xl">
                Analisis proaktif dari AI SecureProfit. Memantau anomali margin, keterlambatan timesheet, dan risiko tagihan sebelum menjadi masalah besar.
              </p>
            </div>

            {/* Weekly Summary Panel */}
            <div 
              className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
              style={{ animationDelay: '100ms' }}
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] rounded-full pointer-events-none -mr-16 -mt-16" />
              
              <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
                <div className="flex-shrink-0 bg-background border border-border p-3 rounded-lg shadow-sm">
                  <Activity className="w-6 h-6 text-primary" />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-lg font-medium text-foreground">
                      Senin, 27 Juli 2026
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">Ringkasan Mingguan</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-5 max-w-xl">
                    AI SecureProfit telah menganalisis aktivitas proyek akhir pekan. Terdapat 3 area utama yang memerlukan perhatian Anda minggu ini:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-background/80 backdrop-blur-sm border border-border/50 p-4 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-[hsl(var(--destructive))]" />
                        <span className="font-medium text-sm text-foreground">Risiko Margin</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        2 proyek utama memiliki margin berjalan di bawah ambang batas aman (&lt; 30%).
                      </p>
                    </div>
                    
                    <div className="bg-background/80 backdrop-blur-sm border border-border/50 p-4 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-[hsl(var(--warning))]" />
                        <span className="font-medium text-sm text-foreground">Penagihan Tersendat</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Rp 1,25 Miliar potensi tagihan tertunda akibat timesheet konsultan belum disetujui.
                      </p>
                    </div>

                    <div className="bg-background/80 backdrop-blur-sm border border-border/50 p-4 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />
                        <span className="font-medium text-sm text-foreground">Kebocoran Anggaran</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Penggunaan anggaran cloud AWS membengkak 15% pada proyek Red Teaming.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Alert List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Tindakan Diperlukan ({alerts.length})
                </h3>
              </div>

              {alerts.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl">
                  <CheckCircle2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <h4 className="text-foreground font-medium mb-1">Semua bersih</h4>
                  <p className="text-sm text-muted-foreground">Tidak ada peringatan baru saat ini.</p>
                </div>
              ) : (
                alerts.map((alert, idx) => (
                  <div 
                    key={alert.id}
                    className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
                    style={{ animationDelay: `${(idx + 2) * 100}ms` }}
                  >
                    <AlertCard alert={alert} onDismiss={() => handleDismiss(alert.id)} />
                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

// -----------------------------
// Helper Components
// -----------------------------

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    colorClass: "text-[hsl(var(--destructive))]",
    bgClass: "bg-[hsl(var(--destructive))]/10",
    borderClass: "bg-[hsl(var(--destructive))]",
  },
  warning: {
    icon: AlertTriangle,
    colorClass: "text-[hsl(var(--warning))]",
    bgClass: "bg-[hsl(var(--warning))]/10",
    borderClass: "bg-[hsl(var(--warning))]",
  },
  info: {
    icon: Info,
    colorClass: "text-[#3b82f6]", // Standard blue for info
    bgClass: "bg-[#3b82f6]/10",
    borderClass: "bg-[#3b82f6]",
  }
};

const DELTA_CONFIG = {
  destructive: "text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10",
  warning: "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10",
  success: "text-[hsl(var(--success))] bg-[hsl(var(--success))]/10",
  neutral: "text-muted-foreground bg-accent",
};

function AlertCard({ alert, onDismiss }: { alert: AlertData; onDismiss: () => void }) {
  const config = SEVERITY_CONFIG[alert.severity];
  const Icon = config.icon;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-border/80 shadow-sm hover:shadow-md">
      {/* Left indicator line */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.borderClass}`} />
      
      <div className="p-5 md:p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-md ${config.bgClass} ${config.colorClass}`}>
               <Icon className="w-4 h-4" />
            </div>
            <div>
               <div className="flex items-center gap-2">
                 <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                   {alert.category}
                 </span>
                 <span className="text-[10px] text-muted-foreground opacity-50">•</span>
                 <span className="text-[11px] text-muted-foreground">{alert.time}</span>
               </div>
               <h3 className="text-base font-medium text-card-foreground mt-0.5 leading-snug">
                 {alert.title}
               </h3>
            </div>
          </div>
          
          <button className="text-muted-foreground hover:text-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
          <div className="lg:col-span-3 bg-gradient-to-r from-primary/5 to-transparent border border-primary/10 rounded-lg p-4 flex gap-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-0.5 h-full bg-primary/40" />
            <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5 opacity-80" />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1.5 block">
                Analisis AI
              </span>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {alert.aiInsight}
              </p>
            </div>
          </div>

          {alert.metric && (
            <div className="lg:col-span-1 bg-background/50 border border-border/60 rounded-lg p-4 flex flex-col justify-center shadow-inner">
              <span className="text-xs text-muted-foreground mb-1.5 block font-medium">
                {alert.metric.label}
              </span>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-semibold tracking-tight text-foreground">
                  {alert.metric.current}
                </span>
                {alert.metric.delta && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${DELTA_CONFIG[alert.metric.deltaColor]}`}>
                    {alert.metric.deltaIcon === "down" && <TrendingDown className="w-3 h-3" />}
                    {alert.metric.deltaIcon === "up" && <TrendingUp className="w-3 h-3" />}
                    {alert.metric.delta}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1 opacity-70">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                {alert.metric.previous}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 md:px-6 py-3.5 bg-muted/10 border-t border-border/50 flex flex-wrap items-center gap-2">
        {alert.actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className={`inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-8 rounded-md px-4 shadow-sm
              ${action.primary 
                ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                : "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
              }`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
        
        <div className="flex-1" />
        
        <button 
          onClick={onDismiss}
          className="inline-flex items-center justify-center gap-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground hover:text-foreground h-8 rounded-md px-3 hover:bg-accent"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Tandai Selesai
        </button>
      </div>
    </div>
  );
}
