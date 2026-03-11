import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, Trash2, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string; type: string }[];
}

const SUGGESTED_QUESTIONS = [
  "Sản phẩm nào bán chạy nhất?",
  "Chính sách đổi trả như thế nào?",
  "Bảng giá hiện tại?",
  "Quy trình đặt hàng?",
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Parse one SSE line → content string or null */
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
    return null; // incomplete JSON, skip
  }
}

export function KnowledgeChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load chat history on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setHistoryLoaded(true); return; }

        const { data } = await supabase
          .from("knowledge_chat_history")
          .select("question, answer, sources")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (data && data.length > 0) {
          const history: ChatMessage[] = [];
          for (const item of data.reverse()) {
            history.push({ role: "user", content: item.question });
            history.push({
              role: "assistant",
              content: item.answer,
              sources: (item.sources as any[]) || undefined,
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

    // Cancel previous request if any
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
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

      // Stream processing
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let streamSources: any[] = [];
      let gotFirstData = false;

      // 20s timeout for first data
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
          return [...prev, { role: "assistant", content: text, sources: sources?.length ? sources : undefined }];
        });
      };

      // Read stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!gotFirstData) {
          gotFirstData = true;
          clearTimeout(firstDataTimeout);
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;

          const result = parseSSELine(line);
          if (!result) continue;
          if (result.done) break;
          if (result.sources) {
            streamSources = result.sources;
            continue;
          }
          if (result.content) {
            assistantText += result.content;
            updateAssistant(assistantText, streamSources);
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        for (const line of buffer.split("\n")) {
          const trimmed = line.replace(/\r$/, "");
          if (!trimmed || trimmed.startsWith(":")) continue;
          const result = parseSSELine(trimmed);
          if (result?.content) {
            assistantText += result.content;
            updateAssistant(assistantText, streamSources);
          }
        }
      }

      clearTimeout(firstDataTimeout);

      // Show error if no content received
      if (!assistantText) {
        updateAssistant("Xin lỗi, không nhận được phản hồi. Vui lòng thử lại.");
      } else {
        // Save to history
        saveChatHistory(text, assistantText, streamSources);
      }

    } catch (err: any) {
      if (err.name === "AbortError") {
        toast.error("Phản hồi quá lâu. Vui lòng thử lại.");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "⏱️ Phản hồi quá lâu. Vui lòng thử câu hỏi ngắn hơn." },
        ]);
      } else {
        console.error("Chat error:", err);
        toast.error(err.message || "Lỗi kết nối");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ ${err.message || "Đã xảy ra lỗi"}. Vui lòng thử lại.` },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Trợ lý AI</h3>
            <p className="text-[10px] text-muted-foreground">Kho Kiến Thức</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && historyLoaded && (
          <div className="text-center text-muted-foreground py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mx-auto">
              <Bot className="h-8 w-8 text-primary/30" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Xin chào! Tôi có thể giúp gì?</p>
              <p className="text-xs">Hỏi bất kỳ câu hỏi nào về sản phẩm, dịch vụ...</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs h-auto py-1.5 px-3 rounded-full"
                  onClick={() => sendMessage(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1.5 [&>ul]:mb-1.5 [&>ol]:mb-1.5">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">📚 Tham khảo:</p>
                    <div className="flex flex-wrap gap-1">
                      {msg.sources.map((s, j) => (
                        <span key={j} className="inline-block text-[10px] bg-background/50 rounded-full px-2 py-0.5">
                          {s.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {msg.role === "assistant" && (
                  <div className="mt-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleCopy(msg.content, i)}
                    >
                      {copiedIndex === i ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center mt-0.5">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-3.5 py-2.5">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập câu hỏi..."
            disabled={isLoading}
            className="flex-1 rounded-full"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="rounded-full">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
