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
  Search,
  Eye,
  CheckCircle2,
  AlertCircle,
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

interface KnowledgeDocumentManagerProps {
  canDelete?: boolean;
}

export function KnowledgeDocumentManager({ canDelete = true }: KnowledgeDocumentManagerProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Preview dialog
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDocument | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("id, title, content, document_type, file_url, faq_answer, created_at")
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
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("knowledge-files")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

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
        // Use edge function with storage path (not public URL)
        try {
          const { data: extractData, error: extractError } =
            await supabase.functions.invoke("extract-document", {
              body: { storagePath, fileName: file.name },
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
          file_url: storagePath,
        });

      if (insertError) throw insertError;

      const contentLen = content.length;
      const isExtracted = contentLen > 50 && !content.startsWith("[");
      toast.success(
        isExtracted
          ? `Upload thành công! Đã đọc ${contentLen.toLocaleString()} ký tự`
          : "Upload thành công! Nội dung cần chỉnh sửa thủ công."
      );
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

    if (doc.file_url) {
      await supabase.storage.from("knowledge-files").remove([doc.file_url]);
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

  const getContentStatus = (doc: KnowledgeDocument) => {
    const content = doc.document_type === "faq" ? doc.faq_answer : doc.content;
    const len = content?.length || 0;
    if (len === 0 || content?.startsWith("[")) {
      return { icon: AlertCircle, color: "text-destructive", label: "Chưa có nội dung" };
    }
    return { icon: CheckCircle2, color: "text-success", label: `${len.toLocaleString()} ký tự` };
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

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                {uploading ? "Đang upload & đọc nội dung..." : "PDF, DOCX, TXT (tối đa 20MB)"}
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
        <div className="p-3 pb-1 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Tài liệu ({filteredDocs.length})
          </p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tài liệu..."
              className="text-xs h-7 pl-7"
            />
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="px-3 pb-3 space-y-1.5">
            {loading && <p className="text-xs text-muted-foreground text-center py-4">Đang tải...</p>}
            {!loading && filteredDocs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                {searchQuery ? "Không tìm thấy" : "Chưa có tài liệu nào"}
              </p>
            )}
            {filteredDocs.map((doc) => {
              const status = getContentStatus(doc);
              const StatusIcon = status.icon;
              return (
                <Card key={doc.id} className="p-2 flex items-center gap-2">
                  <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{doc.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {getTypeBadge(doc.document_type)}
                      <StatusIcon className={`h-3 w-3 ${status.color}`} />
                      <span className="text-[10px] text-muted-foreground">{status.label}</span>
                    </div>
                  </div>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPreviewDoc(doc)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    {canDelete && (
                      <>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(doc)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(doc)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewDoc && getTypeBadge(previewDoc.document_type)}
              {previewDoc?.title}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="text-sm whitespace-pre-wrap">
              {previewDoc?.document_type === "faq" ? (
                <div className="space-y-2">
                  <p className="font-medium">Câu hỏi: {previewDoc?.title}</p>
                  <p>{previewDoc?.faq_answer || "Chưa có câu trả lời"}</p>
                </div>
              ) : (
                previewDoc?.content || "Chưa có nội dung"
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

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
                <Label>Nội dung ({editContent.length.toLocaleString()} ký tự)</Label>
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
