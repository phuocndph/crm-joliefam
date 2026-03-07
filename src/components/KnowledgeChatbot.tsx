import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, Trash2, Copy, Check, History } from "lucide-react";
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

export function KnowledgeChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load recent chat history
  useEffect(() => {
    const loadHistory = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("knowledge_chat_history")
        .select("question, answer, sources")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (data && data.length > 0) {
        const history: ChatMessage[] = [];
        // Reverse to show oldest first
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
      setHistoryLoaded(true);
    };
    loadHistory();
  }, []);

  const handleCopy = async (content: string, index: number) => {
    await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    toast.success("Đã sao chép");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const sendMessage = async (question?: string) => {
    const text = (question || input).trim();
    if (!text || isLoading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("knowledge-chat", {
        body: {
          question: text,
          chatHistory: messages.slice(-6),
        },
      });

      if (error) throw error;

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.answer,
        sources: data.sources,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("Chat error:", err);
      toast.error("Không thể gửi câu hỏi. Vui lòng thử lại.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Đã xảy ra lỗi. Vui lòng thử lại sau." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Trợ lý AI - Kho Kiến Thức</h3>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && historyLoaded && (
          <div className="text-center text-muted-foreground py-8 space-y-4">
            <Bot className="h-12 w-12 mx-auto opacity-30" />
            <div className="space-y-1">
              <p className="text-sm">Hỏi bất kỳ câu hỏi nào về sản phẩm, dịch vụ...</p>
              <p className="text-xs">AI sẽ trả lời dựa trên tài liệu trong kho kiến thức</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs h-auto py-1.5 px-3"
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
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">📚 Tài liệu tham khảo:</p>
                    {msg.sources.map((s, j) => (
                      <span key={j} className="inline-block text-xs bg-background/50 rounded px-1.5 py-0.5 mr-1 mb-1">
                        {s.title}
                      </span>
                    ))}
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
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2 items-center">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t">
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
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
