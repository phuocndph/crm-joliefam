import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, Trash2, Copy, Check, FileText, Globe, HelpCircle, Sparkles, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface QuotationItem {
  yeu_cau_goc: string;
  phan_tich: string;
  sku: string;
  ten_sp: string;
  chat_lieu: string;
  gia_don_vi: number;
  so_luong: number;
  thanh_tien: number;
  ghi_chu: string;
}

interface QuotationResult {
  items: QuotationItem[];
  tong_cong: number;
  luu_y?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string; type: string }[];
  timestamp?: Date;
  quotation?: QuotationResult;
}

const SUGGESTED_QUESTIONS = [
  "Sản phẩm nào bán chạy nhất?",
  "Chính sách đổi trả như thế nào?",
  "Bảng giá hiện tại?",
  "Quy trình đặt hàng?",
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function parseSSELine(line: string): { content?: string; sources?: any[]; done?: boolean } | null {
  if (!line.startsWith("data: ")) return null;
  const json = line.slice(6).trim();
  if (json === "[DONE]") return { done: true };
  try {
    const parsed = JSON.parse(json);
    if (parsed.sources) return { sources: parsed.sources };
    const content = parsed.choices?.[0]?.delta?.content as string | undefined;
    if (content) return { content };
    return null;
  } catch {
    return null;
  }
}

function getSourceIcon(type: string) {
  switch (type?.toLowerCase()) {
    case "pdf": return <FileText className="h-3 w-3" />;
    case "url": case "link": return <Globe className="h-3 w-3" />;
    case "faq": return <HelpCircle className="h-3 w-3" />;
    default: return <FileText className="h-3 w-3" />;
  }
}

function getSourceColor(type: string) {
  switch (type?.toLowerCase()) {
    case "pdf": return "bg-destructive/10 text-destructive border-destructive/20";
    case "url": case "link": return "bg-primary/10 text-primary border-primary/20";
    case "faq": return "bg-warning/10 text-warning border-warning/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

const markdownComponents = {
  h1: ({ ...props }: any) => <h1 className="text-base font-bold text-foreground mb-2 mt-3 first:mt-0" {...props} />,
  h2: ({ ...props }: any) => <h2 className="text-sm font-bold text-foreground mb-1.5 mt-2.5 first:mt-0" {...props} />,
  h3: ({ ...props }: any) => <h3 className="text-sm font-semibold text-foreground mb-1 mt-2 first:mt-0" {...props} />,
  p: ({ ...props }: any) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
  ul: ({ ...props }: any) => <ul className="mb-2 last:mb-0 space-y-1 ml-1" {...props} />,
  ol: ({ ...props }: any) => <ol className="mb-2 last:mb-0 space-y-1 ml-1 list-decimal list-inside" {...props} />,
  li: ({ children, ...props }: any) => (
    <li className="flex items-start gap-1.5" {...props}>
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-[7px] flex-shrink-0" />
      <span className="flex-1">{children}</span>
    </li>
  ),
  strong: ({ ...props }: any) => <strong className="font-semibold text-foreground" {...props} />,
  em: ({ ...props }: any) => <em className="italic text-muted-foreground" {...props} />,
  code: ({ className, children, ...props }: any) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <pre className="my-2 rounded-lg bg-muted/80 border border-border p-3 overflow-x-auto">
          <code className="text-xs font-mono text-foreground" {...props}>{children}</code>
        </pre>
      );
    }
    return <code className="bg-muted/80 text-foreground rounded px-1.5 py-0.5 text-xs font-mono border border-border/50" {...props}>{children}</code>;
  },
  a: ({ ...props }: any) => <a className="text-primary underline decoration-primary/30 hover:decoration-primary transition-colors" target="_blank" rel="noopener" {...props} />,
  blockquote: ({ ...props }: any) => <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic" {...props} />,
  table: ({ ...props }: any) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse" {...props} /></div>,
  th: ({ ...props }: any) => <th className="border border-border bg-muted px-2 py-1 text-left font-semibold" {...props} />,
  td: ({ ...props }: any) => <td className="border border-border px-2 py-1" {...props} />,
};

export function KnowledgeChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "0";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Load chat history on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setHistoryLoaded(true); return; }
        const { data } = await supabase
          .from("knowledge_chat_history")
          .select("question, answer, sources, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);
        if (data && data.length > 0) {
          const history: ChatMessage[] = [];
          for (const item of data.reverse()) {
            history.push({ role: "user", content: item.question, timestamp: new Date(item.created_at) });
            history.push({
              role: "assistant",
              content: item.answer,
              sources: (item.sources as any[]) || undefined,
              timestamp: new Date(item.created_at),
            });
          }
          setMessages(history);
        }
      } catch (e) {
        console.error("Failed to load chat history:", e);
      }
      setHistoryLoaded(true);
    })();
  }, []);

  const handleCopy = async (content: string, index: number) => {
    await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    toast.success("Đã sao chép");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const saveChatHistory = useCallback(async (question: string, answer: string, sources: any[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("knowledge_chat_history").insert({
        user_id: user.id,
        question,
        answer,
        sources: sources.length > 0 ? sources : null,
      });
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }
  }, []);

  const sendMessage = async (question?: string) => {
    const text = (question || input).trim();
    if (!text || isLoading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Chưa đăng nhập");

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/knowledge-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          question: text,
          chatHistory: messages.slice(-2),
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Lỗi server (${resp.status})`);
      }
      if (!resp.body) throw new Error("Không nhận được phản hồi");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let streamSources: any[] = [];
      let gotFirstData = false;

      const firstDataTimeout = setTimeout(() => {
        if (!gotFirstData) controller.abort();
      }, 20000);

      const updateAssistant = (text: string, sources?: any[]) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: text, sources: sources?.length ? sources : m.sources }
                : m
            );
          }
          return [...prev, { role: "assistant", content: text, sources: sources?.length ? sources : undefined, timestamp: new Date() }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!gotFirstData) { gotFirstData = true; clearTimeout(firstDataTimeout); }
        buffer += decoder.decode(value, { stream: true });
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          const result = parseSSELine(line);
          if (!result) continue;
          if (result.done) break;
          if (result.sources) { streamSources = result.sources; continue; }
          if (result.content) { assistantText += result.content; updateAssistant(assistantText, streamSources); }
        }
      }

      if (buffer.trim()) {
        for (const line of buffer.split("\n")) {
          const trimmed = line.replace(/\r$/, "");
          if (!trimmed || trimmed.startsWith(":")) continue;
          const result = parseSSELine(trimmed);
          if (result?.content) { assistantText += result.content; updateAssistant(assistantText, streamSources); }
        }
      }

      clearTimeout(firstDataTimeout);
      if (!assistantText) {
        updateAssistant("Xin lỗi, không nhận được phản hồi. Vui lòng thử lại.");
      } else {
        // Try to parse as quotation JSON
        let quotation: QuotationResult | undefined;
        try {
          const clean = assistantText.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(clean);
          if (parsed.items && Array.isArray(parsed.items)) {
            quotation = parsed as QuotationResult;
          }
        } catch (_) { /* not JSON, normal message */ }

        if (quotation) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: assistantText, quotation, sources: streamSources.length ? streamSources : m.sources } : m
              );
            }
            return [...prev, { role: "assistant", content: assistantText, quotation, sources: streamSources.length ? streamSources : undefined, timestamp: new Date() }];
          });
        }
        saveChatHistory(text, assistantText, streamSources);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast.error("Phản hồi quá lâu. Vui lòng thử lại.");
        setMessages((prev) => [...prev, { role: "assistant", content: "⏱️ Phản hồi quá lâu. Vui lòng thử câu hỏi ngắn hơn.", timestamp: new Date() }]);
      } else {
        console.error("Chat error:", err);
        toast.error(err.message || "Lỗi kết nối");
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err.message || "Đã xảy ra lỗi"}. Vui lòng thử lại.`, timestamp: new Date() }]);
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-brand">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            {isLoading && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-card animate-pulse" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Trợ lý AI</h3>
            <p className="text-[10px] text-muted-foreground">
              {isLoading ? "Đang trả lời..." : "Kho Kiến Thức"}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setMessages([])}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-4">
        {messages.length === 0 && historyLoaded && (
          <div className="text-center py-10 space-y-5 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto shadow-soft">
              <Bot className="h-8 w-8 text-primary/40" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">Xin chào! Tôi có thể giúp gì?</p>
              <p className="text-xs text-muted-foreground">Hỏi bất kỳ câu hỏi nào về sản phẩm, dịch vụ...</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-sm mx-auto">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs h-auto py-2 px-3.5 rounded-full border-border/60 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all duration-200"
                  onClick={() => sendMessage(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            const isLast = i === messages.length - 1;

            return (
              <div
                key={i}
                className={cn(
                  "flex gap-2",
                  isUser ? "justify-end" : "justify-start",
                  isLast && "animate-fade-in"
                )}
              >
                {/* Assistant avatar */}
                {!isUser && (
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={cn(
                      "w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center",
                      isLoading && isLast && "animate-pulse"
                    )}>
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  </div>
                )}

                {/* Message bubble */}
                <div className={cn("max-w-[85%] group relative", isUser ? "order-first" : "")}>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm",
                      isUser
                        ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground rounded-br-md shadow-brand"
                        : "bg-card border border-border/60 rounded-bl-md shadow-soft"
                    )}
                  >
                    {isUser ? (
                      <p className="leading-relaxed">{msg.content}</p>
                    ) : (
                      <div className="prose-chat text-foreground">
                        <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                      </div>
                    )}

                    {/* Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-border/40">
                        <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">📚 Tài liệu tham khảo</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((s, j) => (
                            <span
                              key={j}
                              className={cn(
                                "inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 border",
                                getSourceColor(s.type)
                              )}
                            >
                              {getSourceIcon(s.type)}
                              {s.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions (copy) for assistant */}
                  {!isUser && (
                    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-md"
                        onClick={() => handleCopy(msg.content, i)}
                      >
                        {copiedIndex === i ? (
                          <Check className="h-3 w-3 text-success" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {/* User avatar */}
                {isUser && (
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
                      <User className="h-3.5 w-3.5 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-2 items-start animate-fade-in">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center animate-pulse">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-card border border-border/60 rounded-2xl rounded-bl-md px-4 py-3 shadow-soft">
                <div className="flex gap-1.5 items-center">
                  <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-3 py-3 border-t bg-card/80 backdrop-blur-sm">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="flex items-end gap-2"
        >
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập câu hỏi..."
              disabled={isLoading}
              rows={1}
              className="min-h-[40px] max-h-[120px] resize-none rounded-xl border-border/60 bg-background focus:border-primary/40 focus:ring-primary/20 pr-3 py-2.5 text-sm transition-all"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-brand transition-all duration-200 hover:scale-105 active:scale-95 flex-shrink-0"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
