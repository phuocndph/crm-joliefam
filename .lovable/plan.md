

## Sửa logic xử lý ảnh: OCR → text → chạy như text bình thường

### Vấn đề
Code hiện tại dùng "single-step" — nhồi cả catalog (917 SP) vào prompt cùng ảnh → AI xử lý chậm (~50s), dễ timeout.

Đúng ra phải là: **Ảnh → OCR ra text → dùng text đó chạy qua pipeline text bình thường** (segment, filter, match) — giống hệt khi user gõ text.

### Thay đổi

**File: `supabase/functions/lookup-tax-code/index.ts` (lines 1476-1546)**

Thay toàn bộ block `if (hasImage)` hiện tại bằng logic OCR thuần:

```typescript
if (hasImage) {
  step1Start = Date.now();
  console.log('AI Quote Fill: Step 1 — OCR extract text from image...');

  const ocrPrompt = `Trích xuất TOÀN BỘ bảng sản phẩm từ ảnh. Trả về JSON thuần:
{"san_pham":[{"ten_san_pham":"...","quy_cach":"...","so_luong":1,"don_gia":0,"thanh_tien":0}]}
Giữ nguyên số liệu gốc. Chuỗi rỗng cho thông tin thiếu. KHÔNG giải thích.`;

  try {
    const ocrMessages = [
      { role: "system", content: ocrPrompt },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}` } },
          { type: "text", text: "Trích xuất bảng sản phẩm." },
        ],
      },
    ];

    const ocrModel = aiConfig['ai_quote_ocr_model'] || "google/gemini-2.5-flash";
    const ocrResult = await callAI(ocrMessages, true, ocrModel, 'ocr');

    if (ocrResult?.san_pham && Array.isArray(ocrResult.san_pham)) {
      effectiveRequest = ocrResult.san_pham.map((p: any) =>
        `${p.ten_san_pham || ''} ${p.quy_cach || ''} x${p.so_luong || 1}`.trim()
      ).join('\n');
      console.log(`Step 1 OCR: ${ocrResult.san_pham.length} products in ${Date.now() - step1Start}ms`);
      console.log('OCR text:', effectiveRequest);
    }
  } catch (e) {
    console.error('OCR failed:', e);
    // effectiveRequest giữ nguyên = request gốc, Step 2 vẫn chạy
  }
}
```

**Không sửa gì khác.** Sau block này, `effectiveRequest` chứa text OCR → chạy vào Step 2 (segment → filter → match) giống hệt text bình thường.

### Tại sao nhanh hơn
- Step 1 OCR: prompt nhỏ (không có catalog) → ~5-8s
- Step 2 text match: catalog đã filter → ~5-8s
- Tổng: ~10-15s thay vì 50s

### Không mất gì
- Nếu OCR fail → `effectiveRequest` giữ nguyên text gốc user nhập → Step 2 vẫn chạy
- Step 2 giữ nguyên 100% logic hiện tại (segment, filter, validate, repair)

