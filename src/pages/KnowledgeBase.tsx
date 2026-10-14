import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { isLocalBackend, localAdminUser } from "@/lib/runtime-config";
import { KnowledgeDocumentManager } from "@/components/KnowledgeDocumentManager";
import { KnowledgeChatbot } from "@/components/KnowledgeChatbot";
import { BookOpen, MessageSquare, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

const KnowledgeBase = () => {
  const localMode = isLocalBackend();
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { role } = useUserRole(user);
  const isMobile = useIsMobile();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate("/auth");
        return;
      }
      setUser(user);
    });
  }, [navigate, localMode]);

  const isManager = role === "admin" || role === "manager";

  // Mobile: always show tabs (Chat AI / Tài liệu)
  if (isMobile) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col">
        <div className="flex items-center gap-2 p-3 border-b">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Kho Kiến Thức</h1>
        </div>
        <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-3 mt-2 grid grid-cols-2">
            <TabsTrigger value="chat">
              <MessageSquare className="h-4 w-4 mr-1" /> Trò chuyện với AI
            </TabsTrigger>
            <TabsTrigger value="docs">
              <FileText className="h-4 w-4 mr-1" /> Tài liệu
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex-1 overflow-hidden m-0">
            <KnowledgeChatbot />
          </TabsContent>
          <TabsContent value="docs" className="flex-1 overflow-hidden m-0 border-t">
            <KnowledgeDocumentManager canDelete={isManager} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="text-xl md:text-2xl font-bold">Kho Kiến Thức</h1>
      </div>

      <div className="grid gap-4 h-[calc(100vh-180px)] md:grid-cols-[400px_1fr]">
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <KnowledgeDocumentManager canDelete={isManager} />
        </div>
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <KnowledgeChatbot />
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBase;
