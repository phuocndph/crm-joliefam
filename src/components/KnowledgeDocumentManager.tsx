import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  FileText,
  HelpCircle,
  Trash2,
  Plus,
  Loader2,
  File,
  Edit,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string | null;
  document_type: string;
  file_url: string | null;
  faq_answer: string | null;
  created_at: string;
}

export function KnowledgeDocumentManager() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Text form
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  // FAQ form
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");

  // Edit dialog
  const [editDoc, setEditDoc] = useState<KnowledgeDocument | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editFaqAnswer, setEditFaqAnswer] = useState("");

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
    } else {
      setDocuments((data || []) as KnowledgeDocument[]);
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ];

    if (!allowedTypes.includes(file.type) && !file.name.endsWith(".md")) {
      toast.error("Chỉ hỗ trợ file PDF, DOCX, TXT, MD");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File không được vượt quá 20MB");
      return;
    }

    setUploading(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("knowledge-files")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("knowledge-files")
        .getPublicUrl(fileName);

      // Extract text content
      let content = "";
      const fileType = file.name.endsWith(".pdf")
        ? "pdf"
        : file.name.endsWith(".docx")
        ? "word"
        : "text";

      if (fileType === "text" || file.name.endsWith(".md")) {
        content = await file.text();
      } else {
        // Use edge function to extract
        try {
          const { data: extractData, error: extractError } =
            await supabase.functions.invoke("extract-document", {
              body: { fileUrl: urlData.publicUrl, fileName: file.name },
            });

          if (extractError) throw extractError;
          content = extractData?.content || "";
        } catch (extractErr) {
          console.error("Extract error:", extractErr);
          content = "[Không thể tự động đọc nội dung. Vui lòng chỉnh sửa thủ công.]";
        }
      }

      const { error: insertError } = await supabase
        .from("knowledge_documents")
        .insert({
          title: file.name,
          content,
          document_type: fileType,
          file_url: urlData.publicUrl,
        });

      if (insertError) throw insertError;

      toast.success("Upload tài liệu thành công!");
      fetchDocuments();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Lỗi upload: " + (err.message || "Unknown error"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAddText = async () => {
    if (!textTitle.trim() || !textContent.trim()) {
      toast.error("Vui lòng nhập tiêu đề và nội dung");
      return;
    }

    const { error } = await supabase.from("knowledge_documents").insert({
      title: textTitle.trim(),
      content: textContent.trim(),
      document_type: "text",
    });

    if (error) {
      toast.error("Lỗi lưu tài liệu");
      return;
    }

    toast.success("Thêm tài liệu thành công!");
    setTextTitle("");
    setTextContent("");
    fetchDocuments();
  };

  const handleAddFAQ = async () => {
    if (!faqQuestion.trim() || !faqAnswer.trim()) {
      toast.error("Vui lòng nhập câu hỏi và trả lời");
      return;
    }

    const { error } = await supabase.from("knowledge_documents").insert({
      title: faqQuestion.trim(),
      content: faqQuestion.trim(),
      faq_answer: faqAnswer.trim(),
      document_type: "faq",
    });

    if (error) {
      toast.error("Lỗi lưu FAQ");
      return;
    }

    toast.success("Thêm FAQ thành công!");
    setFaqQuestion("");
    setFaqAnswer("");
    fetchDocuments();
  };

  const handleDelete = async (doc: KnowledgeDocument) => {
    if (!confirm(`Xóa "${doc.title}"?`)) return;

    // Delete file from storage if exists
    if (doc.file_url) {
      const fileName = doc.file_url.split("/").pop();
      if (fileName) {
        await supabase.storage.from("knowledge-files").remove([fileName]);
      }
    }

    const { error } = await supabase
      .from("knowledge_documents")
      .delete()
      .eq("id", doc.id);

    if (error) {
      toast.error("Lỗi xóa tài liệu");
      return;
    }

    toast.success("Đã xóa tài liệu");
    fetchDocuments();
  };

  const openEdit = (doc: KnowledgeDocument) => {
    setEditDoc(doc);
    setEditTitle(doc.title);
    setEditContent(doc.content || "");
    setEditFaqAnswer(doc.faq_answer || "");
  };

  const handleUpdate = async () => {
    if (!editDoc) return;

    const updates: any = { title: editTitle.trim() };
    if (editDoc.document_type === "faq") {
      updates.faq_answer = editFaqAnswer.trim();
      updates.content = editTitle.trim();
    } else {
      updates.content = editContent.trim();
    }

    const { error } = await supabase
      .from("knowledge_documents")
      .update(updates)
      .eq("id", editDoc.id);

    if (error) {
      toast.error("Lỗi cập nhật");
      return;
    }

    toast.success("Cập nhật thành công!");
    setEditDoc(null);
    fetchDocuments();
  };

  const getTypeBadge = (type: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      pdf: { label: "PDF", variant: "default" },
      word: { label: "Word", variant: "default" },
      text: { label: "Text", variant: "secondary" },
      faq: { label: "FAQ", variant: "outline" },
    };
    const item = map[type] || { label: type, variant: "secondary" as const };
    return <Badge variant={item.variant}>{item.label}</Badge>;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">Quản lý tài liệu</h3>
      </div>

      <Tabs defaultValue="upload" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-3">
          <TabsTrigger value="upload" className="text-xs">
            <Upload className="h-3 w-3 mr-1" /> File
          </TabsTrigger>
          <TabsTrigger value="text" className="text-xs">
            <FileText className="h-3 w-3 mr-1" /> Text
          </TabsTrigger>
          <TabsTrigger value="faq" className="text-xs">
            <HelpCircle className="h-3 w-3 mr-1" /> FAQ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="px-3 py-2 space-y-2">
          <div className="border-2 border-dashed rounded-lg p-4 text-center">
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={uploading}
            />
            <label htmlFor="file-upload" className="cursor-pointer space-y-2 block">
              {uploading ? (
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              )}
              <p className="text-xs text-muted-foreground">
                {uploading ? "Đang upload..." : "PDF, DOCX, TXT (tối đa 20MB)"}
              </p>
            </label>
          </div>
        </TabsContent>

        <TabsContent value="text" className="px-3 py-2 space-y-2">
          <div className="space-y-2">
            <Input
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              placeholder="Tiêu đề tài liệu"
              className="text-sm"
            />
            <Textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Nội dung kiến thức..."
              rows={4}
              className="text-sm"
            />
            <Button size="sm" onClick={handleAddText} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Thêm
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="faq" className="px-3 py-2 space-y-2">
          <div className="space-y-2">
            <Input
              value={faqQuestion}
              onChange={(e) => setFaqQuestion(e.target.value)}
              placeholder="Câu hỏi thường gặp"
              className="text-sm"
            />
            <Textarea
              value={faqAnswer}
              onChange={(e) => setFaqAnswer(e.target.value)}
              placeholder="Câu trả lời..."
              rows={4}
              className="text-sm"
            />
            <Button size="sm" onClick={handleAddFAQ} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Thêm FAQ
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Document list */}
      <div className="border-t">
        <div className="p-3 pb-1">
          <p className="text-xs font-medium text-muted-foreground">
            Tài liệu ({documents.length})
          </p>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="px-3 pb-3 space-y-1.5">
            {loading && <p className="text-xs text-muted-foreground text-center py-4">Đang tải...</p>}
            {!loading && documents.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Chưa có tài liệu nào</p>
            )}
            {documents.map((doc) => (
              <Card key={doc.id} className="p-2 flex items-center gap-2">
                <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{doc.title}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {getTypeBadge(doc.document_type)}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(doc)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(doc)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editDoc} onOpenChange={() => setEditDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa tài liệu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tiêu đề</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            {editDoc?.document_type === "faq" ? (
              <div>
                <Label>Câu trả lời</Label>
                <Textarea value={editFaqAnswer} onChange={(e) => setEditFaqAnswer(e.target.value)} rows={6} />
              </div>
            ) : (
              <div>
                <Label>Nội dung</Label>
                <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={8} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDoc(null)}>Hủy</Button>
            <Button onClick={handleUpdate}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
