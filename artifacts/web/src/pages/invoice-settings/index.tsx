import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingPage } from "@/components/common/Loading";
import { useToast } from "@/hooks/use-toast";
import { Building2, Landmark, Save } from "lucide-react";

interface InvoiceSettings {
  companyName: string;
  brand: string;
  addressLines: string[];
  npwp: string;
  email: string;
  phone: string;
  city: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  configured?: boolean;
  updatedAt?: string | null;
}

type FormState = Omit<InvoiceSettings, "addressLines" | "configured" | "updatedAt"> & {
  address: string;
};

export default function InvoiceSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [form, setForm] = useState<FormState>({
    companyName: "",
    brand: "",
    address: "",
    npwp: "",
    email: "",
    phone: "",
    city: "",
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await customFetch<InvoiceSettings>("/api/invoice-settings");
        if (!active) return;
        setConfigured(!!data.configured);
        setForm({
          companyName: data.companyName ?? "",
          brand: data.brand ?? "",
          address: (data.addressLines ?? []).join("\n"),
          npwp: data.npwp ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
          city: data.city ?? "",
          bankName: data.bankName ?? "",
          bankAccountName: data.bankAccountName ?? "",
          bankAccountNumber: data.bankAccountNumber ?? "",
        });
      } catch (e: any) {
        toast({
          title: "Failed to load invoice settings",
          description: e?.message ?? "Unknown error",
          variant: "destructive",
        });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.companyName.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await customFetch("/api/invoice-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName,
          brand: form.brand,
          addressLines: form.address,
          npwp: form.npwp,
          email: form.email,
          phone: form.phone,
          city: form.city,
          bankName: form.bankName,
          bankAccountName: form.bankAccountName,
          bankAccountNumber: form.bankAccountNumber,
        }),
      });
      setConfigured(true);
      toast({
        title: "Invoice settings saved",
        description: "New invoices will use these company and bank details.",
      });
    } catch (e: any) {
      toast({
        title: "Failed to save invoice settings",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingPage />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoice Settings</h1>
        <p className="text-muted-foreground">
          Company and bank details printed on every generated invoice. Changes apply to invoices
          generated from now on; already-archived invoices keep their original details.
        </p>
      </div>

      {!configured && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-amber-300">
            These are sample placeholder details. Update them with your real company and bank
            information so issued invoices are valid.
          </CardContent>
        </Card>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Company Details
            </CardTitle>
            <CardDescription>Issuer information shown in the invoice header.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input id="companyName" value={form.companyName} onChange={set("companyName")} required data-testid="input-company-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand">Brand / Product</Label>
                <Input id="brand" value={form.brand} onChange={set("brand")} data-testid="input-brand" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Address (one line per row)</Label>
              <Textarea id="address" rows={3} value={form.address} onChange={set("address")} data-testid="input-address" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="npwp">NPWP</Label>
                <Input id="npwp" value={form.npwp} onChange={set("npwp")} placeholder="00.000.000.0-000.000" data-testid="input-npwp" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City (for signature block)</Label>
                <Input id="city" value={form.city} onChange={set("city")} data-testid="input-city" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} data-testid="input-email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={set("phone")} data-testid="input-phone" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" /> Bank / Payment Details
            </CardTitle>
            <CardDescription>Shown in the Payment Details box on the invoice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bankName">Bank Name</Label>
              <Input id="bankName" value={form.bankName} onChange={set("bankName")} data-testid="input-bank-name" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bankAccountName">Account Name</Label>
                <Input id="bankAccountName" value={form.bankAccountName} onChange={set("bankAccountName")} data-testid="input-bank-account-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankAccountNumber">Account Number</Label>
                <Input id="bankAccountNumber" value={form.bankAccountNumber} onChange={set("bankAccountNumber")} data-testid="input-bank-account-number" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} data-testid="button-save-invoice-settings">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
