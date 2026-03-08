
-- Add search_vector column to knowledge_documents for full-text search
ALTER TABLE public.knowledge_documents ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_search_vector ON public.knowledge_documents USING GIN (search_vector);

-- Create function to update search_vector
CREATE OR REPLACE FUNCTION update_knowledge_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.faq_answer, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_knowledge_search_vector ON public.knowledge_documents;
CREATE TRIGGER trg_knowledge_search_vector
  BEFORE INSERT OR UPDATE ON public.knowledge_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_search_vector();

-- Backfill existing documents
UPDATE public.knowledge_documents SET search_vector = 
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(content, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(faq_answer, '')), 'B');
