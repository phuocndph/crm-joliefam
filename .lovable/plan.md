

## Cập nhật catalogText đầy đủ 5 cột

### Vấn đề phát hiện

**1. `knowledge-chat/index.ts` (quotation flow) — THIẾU NGHIÊM TRỌNG**
- Query chỉ select: `sku, name, description, price, category, in_stock` → **thiếu `specifications`**
- Catalog gửi vào prompt chỉ 4 cột: `SKU|Tên|extractedMaterial(từ description)|Giá`
- `extractMaterial()` chỉ trích vài keyword từ description → mất ~80% thông tin
- AI không thấy kích thước, quy cách cụ thể → không thể match đúng

**2. `AIQuoteFill.tsx` (frontend → lookup-tax-code) — THIẾU 1 PHẦN**
- `description` chỉ gửi khi `includeImages = true` (dòng 219)
- Khi tắt hình ảnh → edge function nhận 4 cột thay vì 5

### Sửa

#### File 1: `supabase/functions/knowledge-chat/index.ts`

| Dòng | Sửa |
|------|-----|
| 212 | Thêm `specifications` vào select: `"sku, name, description, specifications, price, category, in_stock"` |
| 216-218 | Đổi catalog format sang 5 cột: `${p.sku}|${p.name}|${p.specifications || ''}|${p.description || ''}|${Math.round(Number(p.price || 0))}` |
| 120 | Sửa header prompt: `BẢNG GIÁ (SKU|Tên|Quy cách|Mô tả|Giá)` |

Bỏ hàm `extractMaterial()` — không cần nữa vì gửi nguyên `description`.

#### File 2: `src/components/AIQuoteFill.tsx`

| Dòng | Sửa |
|------|-----|
| 219 | Luôn gửi `description` bất kể `includeImages`: `description: p.description || ""` (bỏ điều kiện `includeImages`) |

### Kết quả
- Cả 2 flow (knowledge-chat quotation + lookup-tax-code AI quote fill) đều gửi đủ 5 cột: `ID/SKU | Tên | Quy cách | Mô tả | Giá`
- AI có đủ ngữ cảnh để match chính xác sản phẩm

