import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { KnowledgeDocumentManager } from "@/components/KnowledgeDocumentManager";
import { KnowledgeChatbot } from "@/components/KnowledgeChatbot";
import { BookOpen } from "lucide-react";

const KnowledgeBase = () => {
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { role } = useUserRole(user);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate("/auth");
        return;
      }
      setUser(user);
    });
  }, [navigate]);

  const isManager = role === "admin" || role === "manager";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="text-xl md:text-2xl font-bold">Kho Kiến Thức</h1>
      </div>

      <div className={`grid gap-4 h-[calc(100vh-180px)] ${isManager ? "md:grid-cols-[350px_1fr]" : ""}`}>
        {isManager && (
          <div className="border rounded-lg overflow-hidden bg-card">
            <KnowledgeDocumentManager />
          </div>
        )}
        <div className="border rounded-lg overflow-hidden bg-card">
          <KnowledgeChatbot />
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBase;
