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

export default function NewClientDialog({ onCreated, triggerLabel = "Add New Client" }: NewClientDialogProps) {
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
        toast({ title: "Client created", description: c?.name });
        qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
        if (c?.id) onCreated?.(c.id);
        setOpen(false);
        setName(""); setContactPerson(""); setEmail(""); setPhone(""); setIndustry("");
      },
      onError: (e: any) =>
        toast({ title: "Failed to create client", description: e?.message, variant: "destructive" }),
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
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Enter the client details. Only the name is required — the rest can be filled in later from the Clients page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Company Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. PT Bank Mandiri"
                data-testid="input-new-client-name"
                autoFocus
              />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="PIC name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@client.co.id" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62 ..." />
              </div>
            </div>
            <div>
              <Label>Industry</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Banking" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
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
              Save Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
