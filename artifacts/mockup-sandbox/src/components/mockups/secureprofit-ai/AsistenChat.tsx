import React from "react";
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  DollarSign,
  Users,
  FileText,
  Settings,
  Sparkles,
  Send,
  AlertTriangle,
  ArrowRight,
  Shield,
  Search,
  Bell,
  MoreVertical,
  CheckCircle2
} from "lucide-react";
import "./_group.css";

const chatMessages = [
  {
    role: "user",
    content: "Proyek mana yang marginnya di bawah 20%?"
  },
  {
    role: "assistant",
    loading: false,
    content: "Berdasarkan data keuangan terbaru, terdapat 2 proyek aktif dengan margin di bawah 20%. Berikut rinciannya:",
    cards: [
      {
        title: "Pentest Mobile Banking — Bank Nusantara",
        margin: "18%",
        value: "Rp 1.250.000.000",
        status: "warning"
      },
      {
        title: "Implementasi SOC — PT Sinar Teknologi Nusantara",
        margin: "15%",
        value: "Rp 3.400.000.000",
        status: "critical"
      }
    ],
    action: "Lihat rincian proyek di modul Keuangan"
  },
  {
    role: "user",
    content: "Berapa total jam tim GRC minggu lalu?"
  },
  {
    role: "assistant",
    loading: false,
    content: "Tim GRC (Governance, Risk, and Compliance) mencatat total 342 jam minggu lalu dengan tingkat utilisasi 85%. Rincian alokasi terbanyak:",
    list: [
      { name: "Budi Santoso", hours: 40, task: "Audit ISO 27001 — FinPay Indonesia" },
      { name: "Rina Wijaya", hours: 38, task: "Assessment PCI-DSS — Bank Mandiri" },
      { name: "Andi Pratama", hours: 35, task: "Penyusunan Kebijakan — PT Telkom" }
    ],
    footer: "Seluruh jam telah disetujui oleh Manajer Proyek."
  },
  {
    role: "user",
    content: "Tampilkan rincian tagihan yang belum dibayar dari Bank Nusantara."
  },
  {
    role: "assistant",
    loading: true,
    content: "Mencari faktur dan tagihan aktif untuk Bank Nusantara..."
  }
];

const TypingIndicator = () => (
  <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-background/50 border border-border rounded-full shadow-sm w-fit mt-1">
    <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }}></div>
    <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "150ms", animationDuration: "1s" }}></div>
    <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "300ms", animationDuration: "1s" }}></div>
  </div>
);

function SidebarItem({ icon: Icon, label, active }: { icon: any, label: string, active?: boolean }) {
  return (
    <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-sidebar-primary/10 text-sidebar-primary' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'}`}>
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function StatCard({ title, value, trend, trendUp }: { title: string, value: string, trend: string, trendUp: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:border-border/80 transition-colors">
      <h3 className="text-sm text-muted-foreground font-medium mb-2">{title}</h3>
      <div className="flex items-end justify-between">
        <span className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">{value}</span>
        <span className={`text-xs font-medium mb-1 ${trendUp ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--warning))]'}`}>
          {trend}
        </span>
      </div>
    </div>
  );
}

function ProjectRow({ name, progress, status, statusColor }: { name: string, progress: string, status: string, statusColor: string }) {
  return (
    <div className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group">
      <div className="flex items-center gap-3 overflow-hidden pr-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
          <Briefcase className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{name}</h4>
          <span className="text-xs text-muted-foreground">{progress} Selesai</span>
        </div>
      </div>
      <span className={`text-xs font-medium ${statusColor} bg-background px-2.5 py-1 rounded-full border border-border shrink-0`}>{status}</span>
    </div>
  );
}

export function AsistenChat() {
  return (
    <div className="h-screen w-full flex bg-background text-foreground font-sans overflow-hidden antialiased selection:bg-primary/20">
      
      {/* Sidebar */}
      <div className="w-[260px] bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 z-20 shadow-xl hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2.5 text-sidebar-foreground">
            <Shield className="w-6 h-6 text-sidebar-primary" />
            <span className="font-bold text-lg tracking-tight">SecureProfit</span>
          </div>
        </div>
        <div className="p-4 flex-1 space-y-1 overflow-y-auto">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active />
          <SidebarItem icon={Briefcase} label="Proyek" />
          <SidebarItem icon={Clock} label="Timesheet" />
          <SidebarItem icon={DollarSign} label="Keuangan" />
          <SidebarItem icon={Users} label="Klien & Leads" />
          <SidebarItem icon={FileText} label="Laporan" />
        </div>
        <div className="p-4 border-t border-sidebar-border shrink-0">
          <SidebarItem icon={Settings} label="Pengaturan" />
        </div>
      </div>

      {/* Main Dashboard Background */}
      <div className="flex-1 flex flex-col min-w-0 bg-background/50 relative hidden sm:flex">
        <header className="h-16 border-b border-border px-8 flex items-center justify-between shrink-0 bg-card/40 backdrop-blur-sm z-10 sticky top-0">
          <h1 className="text-lg font-semibold text-foreground">Dashboard Manajemen</h1>
          <div className="flex items-center gap-5 text-muted-foreground">
            <button className="hidden lg:flex items-center gap-2 bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors shadow-sm">
              <Sparkles className="w-4 h-4" />
              Asisten Data
            </button>
            <div className="h-5 w-px bg-border hidden lg:block"></div>
            <button className="hover:text-foreground transition-colors"><Search className="w-5 h-5" /></button>
            <button className="hover:text-foreground transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full border border-background"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-accent border border-border flex items-center justify-center text-sm font-medium text-foreground ml-2">
              AD
            </div>
          </div>
        </header>
        
        <div className="flex-1 p-8 overflow-y-auto space-y-8 pb-12">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <StatCard title="Total Pendapatan (YTD)" value="Rp 24.500.000.000" trend="+12%" trendUp />
            <StatCard title="Rata-rata Margin" value="34.2%" trend="-1.5%" trendUp={false} />
            <StatCard title="Utilisasi Tim" value="82%" trend="+4%" trendUp />
          </div>
          
          <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm max-w-5xl">
            <div className="p-5 border-b border-border flex items-center justify-between bg-card/50">
              <h2 className="font-semibold text-foreground">Status Proyek Berjalan</h2>
              <button className="text-sm text-primary hover:underline font-medium">Lihat Semua</button>
            </div>
            <div className="divide-y divide-border">
              <ProjectRow name="Audit ISO 27001 — FinPay Indonesia" progress="85%" status="On Track" statusColor="text-[hsl(var(--success))]" />
              <ProjectRow name="Pentest Mobile Banking — Bank Nusantara" progress="40%" status="At Risk" statusColor="text-[hsl(var(--warning))]" />
              <ProjectRow name="Implementasi SOC — PT Sinar Teknologi Nusantara" progress="15%" status="Delayed" statusColor="text-destructive" />
              <ProjectRow name="Assessment Kepatuhan PCI-DSS — Bank Mandiri" progress="60%" status="On Track" statusColor="text-[hsl(var(--success))]" />
            </div>
          </div>
        </div>
      </div>

      {/* AI Assistant Panel */}
      <div className="w-full sm:w-[420px] bg-card border-l border-border flex flex-col shrink-0 z-20 shadow-2xl relative">
        {/* Header */}
        <div className="h-16 border-b border-border bg-card/80 backdrop-blur-md px-5 flex items-center justify-between shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-[0_0_15px_rgba(225,29,72,0.3)]">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Asisten Data</h2>
              <p className="text-[10px] text-[hsl(var(--success))] flex items-center gap-1.5 mt-0.5 font-medium tracking-wide uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse"></span>
                Online
              </p>
            </div>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors p-1.5 hover:bg-accent rounded-md">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-7 scroll-smooth" style={{ scrollbarWidth: 'thin' }}>
          {chatMessages.map((m, i) => (
            <div key={i} className={`flex gap-3 max-w-full ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 border border-primary/20 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              
              <div className={`space-y-3 ${m.role === 'user' ? 'max-w-[85%]' : 'flex-1 min-w-0'}`}>
                {m.role === 'user' ? (
                  <div className="bg-accent text-accent-foreground border border-border rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-sm leading-relaxed">
                    {m.content}
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {m.loading ? (
                      <div className="flex flex-col gap-2">
                        <span className="text-sm text-muted-foreground animate-pulse leading-relaxed font-medium">{m.content}</span>
                        <TypingIndicator />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-foreground/90 leading-relaxed">
                          {m.content}
                        </p>
                        
                        {/* Interactive Cards for Projects */}
                        {m.cards && (
                          <div className="space-y-2.5 pt-1">
                            {m.cards.map((card, idx) => (
                              <div key={idx} className="bg-background border border-border rounded-xl p-3.5 hover:border-primary/50 transition-all cursor-pointer group shadow-sm hover:shadow-md">
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">{card.title}</h4>
                                </div>
                                <div className="flex items-center gap-5 text-xs font-medium">
                                  <div className="flex items-center gap-1.5 text-muted-foreground bg-accent/50 px-2 py-1 rounded-md">
                                    <AlertTriangle className={`w-3.5 h-3.5 ${card.status === 'warning' ? 'text-[hsl(var(--warning))]' : 'text-destructive'}`} />
                                    <span>Margin: <span className={card.status === 'warning' ? 'text-[hsl(var(--warning))]' : 'text-destructive'}>{card.margin}</span></span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <DollarSign className="w-3.5 h-3.5 opacity-70" />
                                    <span>{card.value}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {m.action && (
                          <button className="text-xs text-primary font-semibold flex items-center gap-1.5 hover:underline mt-1">
                            {m.action} <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                        
                        {/* List for Timesheet */}
                        {m.list && (
                          <div className="bg-background border border-border rounded-xl overflow-hidden shadow-sm mt-2">
                            <ul className="divide-y divide-border">
                              {m.list.map((item, idx) => (
                                <li key={idx} className="p-3.5 text-sm flex items-center justify-between hover:bg-accent/30 transition-colors">
                                  <div className="flex flex-col gap-1 overflow-hidden pr-3">
                                    <span className="font-semibold text-foreground truncate">{item.name}</span>
                                    <span className="text-xs text-muted-foreground truncate">{item.task}</span>
                                  </div>
                                  <div className="text-right shrink-0 bg-primary/10 px-2.5 py-1 rounded-md border border-primary/10">
                                    <span className="font-mono text-sm text-primary font-semibold">{item.hours}h</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {m.footer && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium mt-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                            {m.footer}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Bottom spacer so scrolling brings the last message above the input */}
          <div className="h-4"></div>
        </div>

        {/* Input Area */}
        <div className="p-5 bg-card/90 backdrop-blur-md border-t border-border shrink-0 z-10">
          <div className="flex gap-2.5 overflow-x-auto pb-4 snap-x" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {["Ringkasan tagihan bulan ini", "Proyek berisiko terlambat"].map((chip) => (
              <button key={chip} className="snap-start whitespace-nowrap px-3.5 py-1.5 bg-background border border-border rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all shadow-sm">
                {chip}
              </button>
            ))}
          </div>
          <div className="relative group">
            <input 
              type="text" 
              placeholder="Tanyakan tentang proyek, keuangan..." 
              className="w-full bg-background border border-border rounded-xl pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-foreground placeholder:text-muted-foreground shadow-sm transition-all"
              disabled
            />
            <button className="absolute right-1.5 top-1.5 bottom-1.5 aspect-square bg-primary text-primary-foreground rounded-lg flex items-center justify-center hover:bg-primary/90 transition-all shadow-sm group-focus-within:bg-primary">
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-4 flex items-center justify-center gap-1.5 font-medium">
            <Shield className="w-3 h-3 opacity-70" />
            Data diambil langsung dari sistem berdasarkan hak akses Anda
          </p>
        </div>
      </div>
    </div>
  );
}
