import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  trigger?: ReactNode;
}

export function InternalInitiativeRulesDialog({ trigger }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
            data-testid="button-internal-initiative-rules"
          >
            <Info className="h-4 w-4 mr-2" />
            Internal Initiative Rules
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Internal Initiative — Rules of the Game</DialogTitle>
          <DialogDescription>
            How projects flagged as <span className="font-mono">Internal</span>{" "}
            are treated across the platform.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-foreground">
          <section>
            <h3 className="font-semibold text-amber-300 mb-1">Financial treatment</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                No VAT, no invoice, no SPK to client, no contract — this is{" "}
                <span className="text-foreground">internal spending</span>, not
                revenue.
              </li>
              <li>
                The <span className="text-foreground">Internal Budget</span>{" "}
                field acts as a hard <span className="font-mono">spending cap</span>.
              </li>
              <li>
                Costs appear in the{" "}
                <span className="font-mono">Internal Initiative Cost</span>{" "}
                report and are excluded from profitability and VAT reports.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-amber-300 mb-1">SPK &amp; supervision</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                The internal SPK (work order) is{" "}
                <span className="text-foreground">issued and signed by HR</span>
                {" "}— not by Sales or the client.
              </li>
              <li>
                A <span className="text-foreground">Project Manager supervises</span>{" "}
                execution and is the approver for resource clocking
                (timesheet hours logged against this initiative).
              </li>
              <li>
                Hours must still be logged like any other project so utilization
                and capacity reports remain accurate.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-amber-300 mb-1">Reporting visibility</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Included: Internal Initiative Cost, Resource Utilization, Capacity.</li>
              <li>Excluded: Profitability, Margin, VAT Recap, Billing, Cash Inflow.</li>
            </ul>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
