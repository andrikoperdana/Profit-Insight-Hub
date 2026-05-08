import { useRef } from "react";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export const MAX_PDF_BYTES = 4 * 1024 * 1024;

export type PdfFileData = { url: string; name: string };

export function PdfUploadField({
  label,
  fileName,
  onChange,
  testId,
  disabled,
}: {
  label: string;
  fileName: string | null;
  onChange: (data: PdfFileData | null) => void;
  testId: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  function handleFile(file: File | null) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ variant: "destructive", title: "Invalid file type", description: "Only PDF files are accepted." });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast({ variant: "destructive", title: "File too large", description: "PDF must be 4 MB or smaller." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange({ url: String(reader.result), name: file.name });
    reader.onerror = () => toast({ variant: "destructive", title: "Read failed", description: "Could not read the PDF file." });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium leading-none">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        data-testid={`${testId}-input`}
        disabled={disabled}
      />
      {fileName ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate flex-1" data-testid={`${testId}-filename`}>{fileName}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ""; }}
            data-testid={`${testId}-clear`}
            disabled={disabled}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start font-normal"
          onClick={() => inputRef.current?.click()}
          data-testid={`${testId}-button`}
          disabled={disabled}
        >
          <FileText className="h-4 w-4 mr-2" /> Upload PDF (max 4 MB)
        </Button>
      )}
    </div>
  );
}
