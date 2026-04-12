

## Sửa cột Ghi chú + bỏ auto-note từ báo giá

### Thay đổi

**1. `src/components/InlineOrderEditTable.tsx`** — Sửa hiển thị notes (dòng 449-453):
- Bỏ `truncate`, `max-w-[120px]`, `whitespace-nowrap`, `overflow-hidden`, `text-ellipsis`
- Cho phép xuống dòng tự do (`whitespace-pre-wrap`, `break-words`)
- Lọc bỏ notes bắt đầu bằng `Được tạo từ báo giá` — coi như trống, hiển thị `—`
- Notes trống hoặc chỉ có auto-note → hiển thị `—`

**2. `src/components/CreateQuoteForm.tsx`** (dòng 761) — Bỏ ghi chú tự động khi tạo đơn từ báo giá, set `notes: null`

**3. `src/pages/QuotesPage.tsx`** (dòng 234) — Tương tự, set `notes: null`

**4. `src/components/QuoteSupplementDialog.tsx`** (dòng 248) — Tương tự, set `notes: null`

