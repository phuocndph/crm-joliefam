
-- Create knowledge_documents table
CREATE TABLE public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  document_type TEXT NOT NULL DEFAULT 'text' CHECK (document_type IN ('pdf', 'word', 'text', 'faq')),
  file_url TEXT,
  faq_answer TEXT,
  manager_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create knowledge_chat_history table
CREATE TABLE public.knowledge_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources JSONB,
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chat_history ENABLE ROW LEVEL SECURITY;

-- RLS for knowledge_documents: all authenticated users can read
CREATE POLICY "Authenticated users can read knowledge documents"
  ON public.knowledge_documents FOR SELECT TO authenticated
  USING (true);

-- Only admin/manager can insert
CREATE POLICY "Admin and manager can insert knowledge documents"
  ON public.knowledge_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
  );

-- Only admin/manager can update
CREATE POLICY "Admin and manager can update knowledge documents"
  ON public.knowledge_documents FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
  );

-- Only admin/manager can delete
CREATE POLICY "Admin and manager can delete knowledge documents"
  ON public.knowledge_documents FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
  );

-- RLS for knowledge_chat_history: users can only see their own
CREATE POLICY "Users can read own chat history"
  ON public.knowledge_chat_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own chat history"
  ON public.knowledge_chat_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Add set_manager_id trigger for knowledge_documents
CREATE TRIGGER set_knowledge_documents_manager_id
  BEFORE INSERT ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_manager_id();

-- Add set_manager_id trigger for knowledge_chat_history
CREATE TRIGGER set_knowledge_chat_history_manager_id
  BEFORE INSERT ON public.knowledge_chat_history
  FOR EACH ROW EXECUTE FUNCTION public.set_manager_id();

-- Updated_at trigger
CREATE TRIGGER update_knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for knowledge files
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-files', 'knowledge-files', false);

-- Storage RLS: authenticated users can upload
CREATE POLICY "Authenticated users can upload knowledge files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-files');

-- Storage RLS: authenticated users can read
CREATE POLICY "Authenticated users can read knowledge files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-files');

-- Storage RLS: admin/manager can delete
CREATE POLICY "Admin and manager can delete knowledge files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'knowledge-files' AND
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );
