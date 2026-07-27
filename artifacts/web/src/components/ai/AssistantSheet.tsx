import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAiAssistantChat } from "@workspace/api-client-react";
import type { AiChatMessage } from "@workspace/api-client-react";
import { Sparkles, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";

const SUGGESTIONS = [
  "Which projects have a low margin?",
  "Any overdue invoices?",
  "How many hours did I log this month?",
  "Who is available right now?",
];

/**
 * Markdown-lite renderer for assistant replies. Supports **bold**, bullet
 * lists, and [label](link) links — internal links (starting with "/")
 * navigate in-app via wouter; external http(s) links open in a new tab.
 * Everything else is rendered as plain text (no raw HTML injection).
 */
function InlineText({ text, onNavigate }: { text: string; onNavigate: (to: string) => void }) {
  const parts: React.ReactNode[] = [];
  // Tokenize links first, then bold within the remaining text.
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  const pushText = (chunk: string) => {
    const boldRe = /\*\*([^*]+)\*\*/g;
    let bLast = 0;
    let b: RegExpExecArray | null;
    while ((b = boldRe.exec(chunk)) !== null) {
      if (b.index > bLast) parts.push(<span key={`t${key++}`}>{chunk.slice(bLast, b.index)}</span>);
      parts.push(<strong key={`b${key++}`}>{b[1]}</strong>);
      bLast = b.index + b[0].length;
    }
    if (bLast < chunk.length) parts.push(<span key={`t${key++}`}>{chunk.slice(bLast)}</span>);
  };
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) pushText(text.slice(last, m.index));
    const label = m[1];
    const href = m[2];
    if (href.startsWith("/")) {
      parts.push(
        <button
          key={`l${key++}`}
          type="button"
          className="text-primary underline underline-offset-2 hover:opacity-80"
          onClick={() => onNavigate(href)}
        >
          {label}
        </button>,
      );
    } else if (href.startsWith("http://") || href.startsWith("https://")) {
      parts.push(
        <a key={`l${key++}`} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
          {label}
        </a>,
      );
    } else {
      pushText(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) pushText(text.slice(last));
  return <>{parts}</>;
}

function AssistantMarkdown({ text, onNavigate }: { text: string; onNavigate: (to: string) => void }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let key = 0;
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul${key++}`} className="list-disc pl-4 space-y-1">
        {list.map((item, i) => (
          <li key={i}>
            <InlineText text={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line) || /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    if (line.trim() === "") continue;
    const heading = /^#{1,4}\s+(.*)$/.exec(line.trim());
    if (heading) {
      blocks.push(
        <p key={`h${key++}`} className="font-semibold">
          <InlineText text={heading[1]} onNavigate={onNavigate} />
        </p>,
      );
    } else {
      blocks.push(
        <p key={`p${key++}`}>
          <InlineText text={line} onNavigate={onNavigate} />
        </p>,
      );
    }
  }
  flushList();
  return <div className="space-y-2">{blocks}</div>;
}

type ChatEntry = { role: "user" | "assistant"; content: string; failed?: boolean };

export default function AssistantSheet() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  // Messages live here (parent of SheetContent), so closing/reopening the
  // sheet keeps the conversation for the session.
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = useAiAssistantChat({
    mutation: {
      onSuccess: (res) => {
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      },
      onError: (e: any) => {
        const msg =
          e?.status === 429
            ? "Too many questions in a short time — please wait a few minutes and try again."
            : "Sorry, I couldn't answer that right now. Please try again.";
        setMessages((prev) => [...prev, { role: "assistant", content: msg, failed: true }]);
      },
    },
  });

  useEffect(() => {
    // Keep the newest message in view.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, chat.isPending, open]);

  if (!user) return null;

  const send = (text: string) => {
    const content = text.trim();
    if (!content || chat.isPending) return;
    const next: ChatEntry[] = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    // Send the recent window only — the server caps context anyway.
    const history: AiChatMessage[] = next
      .filter((m) => !m.failed)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    chat.mutate({ data: { messages: history } });
  };

  const onNavigate = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="AI data assistant"
          data-testid="button-ai-assistant"
        >
          <Sparkles className="h-5 w-5 text-muted-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Data Assistant
          </SheetTitle>
          <SheetDescription className="text-xs">
            Ask about your projects, hours, billing, or team — answers use live data you're allowed to see.
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs text-muted-foreground">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="text-xs rounded-full border border-border px-3 py-1.5 hover:bg-muted/60 text-left"
                    onClick={() => send(s)}
                    data-testid={`chip-${s.slice(0, 12)}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground pt-2">
                You can ask in English or Bahasa Indonesia.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap"
                    : `max-w-[90%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm ${m.failed ? "bg-destructive/10 text-destructive" : "bg-muted"}`
                }
                data-testid={`chat-msg-${m.role}-${i}`}
              >
                {m.role === "assistant" && !m.failed ? (
                  <AssistantMarkdown text={m.content} onNavigate={onNavigate} />
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}

          {chat.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3" data-testid="chat-typing">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about projects, hours, billing…"
              disabled={chat.isPending}
              data-testid="input-ai-chat"
            />
            <Button
              type="submit"
              size="icon"
              disabled={chat.isPending || !input.trim()}
              aria-label="Send"
              data-testid="button-ai-send"
            >
              <Send className="h-4 w-4" />
            </Button>
            {messages.length > 0 && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setMessages([])}
                aria-label="Clear conversation"
                data-testid="button-ai-clear"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </form>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            AI answers are based on live data but can make mistakes — double-check important numbers.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
