import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Receipt } from "lucide-react";
import { formatDate, formatIDR } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

type MyExpense = {
  id: string;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  category: string;
  description: string;
  amount: number;
  spentAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  hasReceipt: boolean;
};

function statusClass(status: string): string {
  if (status === "APPROVED") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (status === "REJECTED") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-amber-500/15 text-amber-400 border-amber-500/30";
}

async function downloadReceipt(expenseId: string, projectCode: string | null): Promise<Blob> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`/api/expenses/${expenseId}/receipt`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed (${res.status})`);
  }
  return res.blob();
}

export function triggerExpenseReceiptDownload(
  expenseId: string,
  projectCode: string | null,
  onError: (msg: string) => void,
) {
  downloadReceipt(expenseId, projectCode)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expense-${projectCode ?? "receipt"}-${expenseId.slice(-6)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    })
    .catch((err) => onError(err?.message ?? "Failed to download receipt"));
}

export default function MyExpensesCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<MyExpense[]>({
    queryKey: ["my-expenses"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/expenses/mine", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("Failed to load expenses");
      return r.json();
    },
  });

  const list = data ?? [];

  return (
    <Card data-testid="card-my-expenses">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Pengajuan Expense Saya
        </CardTitle>
        <CardDescription>
          Status reimburse expense yang Anda submit. Unduh receipt PDF setelah di-approve atau di-reject.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada pengajuan expense. Submit dari tab Expenses pada halaman proyek.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Tanggal</TableHead>
                  <TableHead>Proyek</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.slice(0, 15).map((e) => (
                  <TableRow key={e.id} data-testid={`row-my-expense-${e.id}`}>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(e.spentAt)}</TableCell>
                    <TableCell>
                      <Link href={`/projects/${e.projectId}`}>
                        <a className="text-xs text-primary hover:underline">
                          {e.projectCode ?? "—"}
                        </a>
                      </Link>
                      <div className="text-[10px] text-muted-foreground max-w-[200px] truncate">
                        {e.projectName ?? ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{e.description}</div>
                      <Badge variant="outline" className="text-[10px] mt-1">{e.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatIDR(e.amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${statusClass(e.status)}`}
                        title={e.rejectionReason ?? (e.approvedByName ? `By ${e.approvedByName}` : "")}
                      >
                        {e.status}
                      </Badge>
                      {e.approvedByName && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {e.status === "REJECTED" ? "By " : "By "} {e.approvedByName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {e.hasReceipt ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          data-testid={`button-download-receipt-${e.id}`}
                          onClick={() =>
                            triggerExpenseReceiptDownload(e.id, e.projectCode, (msg) =>
                              toast({ title: "Download failed", description: msg, variant: "destructive" }),
                            )
                          }
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          PDF
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
