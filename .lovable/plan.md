

## Thêm tính năng chọn AI model cho báo giá

### Mục tiêu
Cho phép người dùng chọn model AI khi tạo báo giá, kèm gợi ý mức chi phí và độ phù hợp để cân bằng giữa tốc độ, chất lượng và chi phí.

### Thiết kế UI

Thêm một dropdown chọn model bên cạnh toggle hình ảnh trong `AIQuoteFill.tsx`, hiển thị:

```text
┌─────────────────────────────────────┐
│ [AI tự chọn SP]  [⚡ Nhanh ▼]      │
│                                     │
│  ⚡ Nhanh & Tiết kiệm (Mặc định)   │
│     gemini-2.5-flash-lite           │
│     → Báo giá đơn giản, ít SP      │
│                                     │
│  ⚖️ Cân bằng                        │
│     gemini-2.5-flash                │
│     → Đa số báo giá thông thường   │
│                                     │
│  🎯 Chính xác cao                   │
│     gemini-3-flash-preview          │
│     → Báo giá phức tạp, nhiều SP   │
│                                     │
│  💎 Cao cấp nhất                    │
│     gemini-2.5-pro                  │
│     → Yêu cầu đặc biệt, cần       │
│       phân tích sâu                 │
└─────────────────────────────────────┘
```

### Logic gợi ý tự động

Dựa trên số sản phẩm sau pre-filter và độ dài yêu cầu:
- **< 30 SP, yêu cầu ngắn** → Gợi ý "Nhanh & Tiết kiệm"
- **30-100 SP** → Gợi ý "Cân bằng"
- **> 100 SP hoặc yêu cầu dài/phức tạp** → Gợi ý "Chính xác cao"

Gợi ý hiển thị dưới dạng badge nhỏ "Gợi ý" bên cạnh option phù hợp, người dùng vẫn tự chọn được.

### Thay đổi chi tiết

| File | Nội dung |
|------|----------|
| `src/components/AIQuoteFill.tsx` | Thêm state `selectedModel`, dropdown Select với 4 options kèm mô tả chi phí/chất lượng. Truyền `model` vào body request. Thêm logic gợi ý tự động dựa trên số SP filtered. |
| `supabase/functions/lookup-tax-code/index.ts` | Nhận param `model` từ request, sử dụng model được chọn cho Lovable AI. Cho Beeknoee fallback: map model tương ứng (gemini-2.5-flash-lite → gemini-2.5-flash, gemini-2.5-pro → gemini-2.5-flash vì Beeknoee không có pro). |

### Chi tiết kỹ thuật

**Models mapping:**
| UI Label | Lovable AI model | Beeknoee fallback |
|----------|-----------------|-------------------|
| Nhanh & Tiết kiệm | google/gemini-2.5-flash-lite | gemini-2.5-flash |
| Cân bằng | google/gemini-2.5-flash | gemini-2.5-flash |
| Chính xác cao | google/gemini-3-flash-preview | gemini-2.5-flash |
| Cao cấp nhất | google/gemini-2.5-pro | gemini-2.5-flash |

**Frontend**: Dropdown sử dụng component `Select` có sẵn, đặt cùng hàng với toggle hình ảnh. Mặc định chọn "Cân bằng".

**Backend**: Hàm `callAI` nhận thêm param `model?: string`, sử dụng nó thay vì hardcode `google/gemini-3-flash-preview`. Chỉ áp dụng cho `ai_quote_fill`, các type khác giữ nguyên model mặc định.

