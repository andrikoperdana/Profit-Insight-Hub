import { useMemo, useState } from "react";
import { useGetVatRecap } from "@workspace/api-client-react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { Download, Receipt, AlertCircle } from "lucide-react";

export default function VatRecapPage() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  const { data, isLoading } = useGetVatRecap({ year });

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 4; y--) out.push(y);
    return out;
  }, [currentYear]);

  const isMgmt = user?.role === "MANAGEMENT";

  if (!isMgmt) {
    return (
      <Layout>
        <div className="p-6">
          <Card className="rounded-xl border-destructive/40">
            <CardContent className="p-6 flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Halaman Rekap PPN hanya dapat diakses oleh Management.
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  function exportCsv() {
    if (!data) return;
    const header = [
      "Bulan", "Jumlah Milestone", "Invoiced", "Paid",
      "Total DPP", "Total PPN", "Total Gross",
      "PPN Sudah Dibayar", "PPN Outstanding",
    ];
    const rows = data.months.map((m) => [
      m.monthLabel,
      m.milestoneCount,
      m.invoicedCount,
      m.paidCount,
      Math.round(m.totalDPP),
      Math.round(m.totalVat),
      Math.round(m.totalGross),
      Math.round(m.paidVat),
      Math.round(m.outstandingVat),
    ]);
    rows.push([
      `TOTAL ${data.year}`,
      data.totals.milestoneCount, "", "",
      Math.round(data.totals.totalDPP),
      Math.round(data.totals.totalVat),
      Math.round(data.totals.totalGross),
      Math.round(data.totals.paidVat),
      Math.round(data.totals.outstandingVat),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-ppn-${data.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="h-6 w-6 text-primary" /> Rekap PPN Bulanan
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Agregat DPP & PPN dari semua milestone yang telah di-invoice atau dibayar.
              Berbasis tanggal <span className="font-mono">invoicedAt</span>. Cocok sebagai
              referensi penyusunan SPT Masa PPN.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    Tahun {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={exportCsv} disabled={!data} variant="outline" data-testid="button-export-vat-csv">
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {data && (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Stat label={`Total DPP ${year}`} value={formatIDR(data.totals.totalDPP)} />
            <Stat label={`Total PPN ${year}`} value={formatIDR(data.totals.totalVat)} tone="primary" />
            <Stat label="PPN Sudah Dibayar" value={formatIDR(data.totals.paidVat)} tone="success" />
            <Stat label="PPN Outstanding" value={formatIDR(data.totals.outstandingVat)} tone="warn" />
          </div>
        )}

        <Card className="rounded-xl border-border shadow-sm">
          <CardHeader>
            <CardTitle>Breakdown Bulanan {year}</CardTitle>
            <CardDescription>
              Outstanding = sudah di-invoice tapi belum dibayar klien (PPN belum diterima kas).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Memuat…</div>
            ) : !data ? (
              <div className="p-6 text-sm text-muted-foreground">Tidak ada data.</div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>Bulan</TableHead>
                    <TableHead className="text-right">Milestone</TableHead>
                    <TableHead className="text-right">Invoiced / Paid</TableHead>
                    <TableHead className="text-right">DPP</TableHead>
                    <TableHead className="text-right">PPN</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">PPN Dibayar</TableHead>
                    <TableHead className="text-right">PPN Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.months.map((m) => {
                    const empty = m.milestoneCount === 0;
                    return (
                      <TableRow key={m.month} className={empty ? "text-muted-foreground" : ""}>
                        <TableCell className="font-medium">{m.monthLabel}</TableCell>
                        <TableCell className="text-right font-mono">{m.milestoneCount}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {m.invoicedCount} / {m.paidCount}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatIDR(m.totalDPP)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-amber-400">
                          {formatIDR(m.totalVat)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatIDR(m.totalGross)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-emerald-400">
                          {formatIDR(m.paidVat)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-orange-400">
                          {formatIDR(m.outstandingVat)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/30 font-semibold border-t-2">
                    <TableCell>TOTAL {data.year}</TableCell>
                    <TableCell className="text-right font-mono">{data.totals.milestoneCount}</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono">{formatIDR(data.totals.totalDPP)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-400">
                      {formatIDR(data.totals.totalVat)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatIDR(data.totals.totalGross)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">
                      {formatIDR(data.totals.paidVat)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-orange-400">
                      {formatIDR(data.totals.outstandingVat)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "primary" | "success" | "warn";
}) {
  const toneMap = {
    muted: "text-foreground",
    primary: "text-primary",
    success: "text-emerald-500",
    warn: "text-orange-400",
  };
  return (
    <Card className="rounded-xl border-border shadow-sm">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-xl font-bold mt-1 ${toneMap[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
