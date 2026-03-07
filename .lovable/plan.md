

# Nang cap Kho Kien Thuc AI - Phan tich & Ke hoach

## Cac van de hien tai

### 1. Loi nghiem trong: Upload file khong hoat dong
- Bucket `knowledge-files` la **private** (is_public: false), nhung code dung `getPublicUrl()` de lay URL -> Edge function `extract-document` se **khong download duoc file**
- Can chuyen sang dung **signed URL** hoac tao supabase client trong edge function de download

### 2. PDF/DOCX extraction rat yeu
- PDF: Chi dung regex tim `Tj/TJ` operators -> hau het PDF hien dai (compressed streams) se **khong doc duoc**
- DOCX: Decode ZIP nhu plain text roi tim `<w:t>` -> **se khong hoat dong** vi DOCX la file ZIP binary, khong the decode UTF-8 truc tiep

### 3. Thieu tinh nang UX quan trong
- Khong co **suggested questions** (cau hoi goi y) khi chua co lich su chat
- Khong load **lich su chat** tu database khi vao lai trang
- Khong co **search/filter** tai lieu
- Khong hien thi **trang thai extract** (thanh cong hay that bai) khi upload file

## Ke hoach nang cap

### Buoc 1: Fix file upload & extraction
- Chuyen `knowledge-files` bucket sang **public** hoac su dung **service role key** trong edge function de download file
- Cai thien PDF extraction: su dung Lovable AI Gateway de extract text tu file (gui file content cho AI de doc)
- Cai thien DOCX extraction: dung proper ZIP decompression (fflate library) de doc `word/document.xml`

### Buoc 2: Cai thien Chatbot UX
- Them **3-4 cau hoi goi y** hien thi khi chua co tin nhan (dua tren tai lieu da upload)
- Load **lich su chat gan day** tu `knowledge_chat_history` khi vao trang
- Them nut **copy** de sao chep cau tra loi AI (de gui cho khach hang)

### Buoc 3: Cai thien Document Manager
- Hien thi **preview noi dung** khi click vao tai lieu
- Them **search** trong danh sach tai lieu
- Hien thi **so ky tu** cua content da extract (de biet file da doc thanh cong hay chua)

## Chi tiet ky thuat

### Fix storage access
```text
KnowledgeDocumentManager.tsx:
  - Upload file -> Supabase Storage (knowledge-files)
  - Thay getPublicUrl() bang createSignedUrl() (hoac make bucket public)

extract-document/index.ts:  
  - Dung service role key de download file tu storage
  - Hoac nhan file content truc tiep tu client thay vi URL
```

### Cai thien extraction
- Doi voi PDF: Gui raw text cho AI Gateway de "doc va tom tat noi dung"
- Doi voi DOCX: Import `fflate` (lightweight ZIP library cho Deno) de unzip va doc XML

### Them tinh nang copy response
```text
KnowledgeChatbot.tsx:
  - Them icon Copy ben canh moi cau tra loi AI
  - Click -> copy noi dung vao clipboard
  - Toast "Da sao chep"
```

### Them suggested questions
```text
KnowledgeChatbot.tsx:
  - Khi chua co tin nhan, hien thi 3-4 chip buttons
  - Vi du: "San pham nao ban chay nhat?", "Chinh sach doi tra?"
  - Click -> tu dong gui cau hoi do
```

## Cac file can sua

| File | Thay doi |
|------|----------|
| `src/components/KnowledgeChatbot.tsx` | Them copy, suggested questions, load history |
| `src/components/KnowledgeDocumentManager.tsx` | Fix upload flow, them search, preview |
| `supabase/functions/extract-document/index.ts` | Fix download, cai thien extraction |
| Migration SQL | Make bucket public hoac them storage policies |

