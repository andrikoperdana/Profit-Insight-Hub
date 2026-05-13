import { useState } from "react";
import {
  useCreateClient,
  getListClientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NewClientDialogProps {
  onCreated?: (clientId: string) => void;
  triggerLabel?: string;
}

export default function NewClientDialog({ onCreated, triggerLabel = "Tambah Klien Baru" }: NewClientDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("");

  const create = useCreateClient({
    mutation: {
      onSuccess: (c: any) => {
        toast({ title: "Klien dibuat", description: c?.name });
        qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
        if (c?.id) onCreated?.(c.id);
        setOpen(false);
        setName(""); setContactPerson(""); setEmail(""); setPhone(""); setIndustry("");
      },
      onError: (e: any) =>
        toast({ title: "Gagal membuat klien", description: e?.message, variant: "destructive" }),
    },
  });

  const canSave = name.trim().length >= 2 && !create.isPending;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="button-open-new-client"
      >
        <Plus className="h-4 w-4 mr-1" /> {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Klien Baru</DialogTitle>
            <DialogDescription>
              Isi data klien. Hanya nama yang wajib — selebihnya bisa dilengkapi nanti di halaman Clients.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nama Perusahaan *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="cth. PT Bank Mandiri"
                data-testid="input-new-client-name"
                autoFocus
              />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Nama PIC" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@klien.co.id" />
              </div>
              <div>
                <Label>Telepon</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62 ..." />
              </div>
            </div>
            <div>
              <Label>Industri</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="cth. Perbankan" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
            <Button
              onClick={() =>
                create.mutate({
                  data: {
                    name: name.trim(),
                    contactPerson: contactPerson.trim() || undefined,
                    email: email.trim() || undefined,
                    phone: phone.trim() || undefined,
                    industry: industry.trim() || undefined,
                  } as any,
                })
              }
              disabled={!canSave}
              data-testid="button-save-new-client"
            >
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Simpan Klien
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
