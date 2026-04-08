

## Thêm tính năng chọn model OCR và xem luồng xử lý ảnh vào Cài đặt AI

### Mô tả
Thêm vào tab Model của trang Cài đặt AI:
1. **Chọn model OCR riêng** (Bước 1 trích xuất ảnh) — tách biệt với model matching text (Bước 2)
2. **Xem luồng xử lý ảnh** — hiển thị sơ đồ pipeline 2 bước (OCR → Text Matching) với thông tin model, delay, fallback chain

### Thay đổi cụ thể

**File: `src/pages/AISettingsPage.tsx`**

#### 1. Thêm cài đặt model OCR
- Thêm field `ai_quote_ocr_model` vào `AISettings` interface và `DEFAULTS` (mặc định: `google/gemini-2.5-flash`)
- Thêm card "Model OCR (Bước 1)" trong tab Model, giữa model Text và model Image hiện tại
- Lọc danh sách model chỉ hiện các model hỗ trợ vision cho OCR (Gemini series)
- Giải thích: model này dùng cho bước trích xuất text từ ảnh, khác với model Image (dùng cho full multimodal khi OCR thất bại)

#### 2. Thêm card "Luồng xử lý ảnh" (Pipeline Visualization)
- Thêm card mới trong tab Model, hiển thị sơ đồ pipeline dạng timeline/steps:
  - **Bước 1 — OCR**: Model OCR → trích xuất text từ ảnh (prompt nhỏ, không catalog)
  - **Delay 1.5s**: Giải phóng concurrent slot Beeknoee
  - **Bước 2 — Text Matching**: Model Text → so khớp với catalog (dùng GLM first nếu Beeknoee)
  - **Fallback**: Nếu OCR thất bại → dùng full multimodal với model Image
- Hiển thị Beeknoee fallback chain cho mỗi bước (model order + timeout)
- Dùng visual steps với icon và badge

#### 3. Thêm cài đặt delay giữa 2 bước
- Thêm field `ai_quote_step_delay` (ms) — mặc định 1500ms
- Input number cho phép điều chỉnh (0-5000ms)

**File: `supabase/functions/lookup-tax-code/index.ts`**

#### 4. Đọc config OCR model và delay từ DB
- Đọc `ai_quote_ocr_model` từ `aiConfig` thay vì hardcode `google/gemini-2.5-flash`
- Đọc `ai_quote_step_delay` từ `aiConfig` thay vì hardcode 1500ms
- Trả thêm metadata về pipeline trong response: `ocrModel`, `matchModel`, `ocrTime`, `matchTime`, `totalTime`

#### 5. Trả metadata luồng trong response
- Bổ sung vào response JSON: `{ pipeline: { step1: { model, time }, delay, step2: { model, time }, total } }`

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `src/pages/AISettingsPage.tsx` | Thêm model OCR selector, pipeline visualization, delay config |
| `supabase/functions/lookup-tax-code/index.ts` | Đọc OCR model + delay từ DB config, trả metadata pipeline |

