

# Tu dong luu nhap (Auto-save Draft) cho form Bao gia

## Van de
Khi dang tao bao gia, neu may tinh tat, trinh duyet bi dong, hoac an nham nut "Huy", toan bo du lieu form se bi mat.

## Giai phap
Su dung `localStorage` de tu dong luu nhap (auto-save) form bao gia moi vai giay. Khi mo lai form, neu co ban nhap cu, hoi nguoi dung co muon khoi phuc khong.

## Chi tiet ky thuat

### File thay doi: `src/components/CreateQuoteForm.tsx`

1. **Tu dong luu vao localStorage** moi 3 giay (debounce):
   - Luu tat ca du lieu form (`form.watch()`) + `selectedProducts` + cac state khac (includeVAT, vatRate, payment1, payment2...)
   - Key: `quote-draft-autosave`
   - Su dung `useEffect` voi `useDebounce` de tranh luu qua nhieu lan

2. **Khoi phuc khi mo form**:
   - Khi component mount, kiem tra `localStorage` co ban nhap khong
   - Neu co, hien thi 1 banner/alert hoi: "Ban co ban nhap chua luu. Khoi phuc?" voi 2 nut: "Khoi phuc" va "Bo qua"
   - Neu khoi phuc: dien lai tat ca du lieu form va selectedProducts
   - Neu bo qua: xoa ban nhap khoi localStorage

3. **Xoa ban nhap khi submit thanh cong**:
   - Sau khi tao bao gia thanh cong, xoa `quote-draft-autosave` khoi localStorage

4. **Hien thi trang thai luu**:
   - Them 1 dong text nho "Da luu nhap luc HH:MM:SS" o goc form de nguoi dung biet du lieu dang duoc bao ve

### Du lieu luu
```typescript
interface QuoteDraft {
  formData: QuoteFormData;
  selectedProducts: QuoteItem[];
  savedAt: string; // ISO timestamp
}
```

### Khong thay doi gi khac
- Khong can thay doi database
- Khong them dependency moi
- Chi sua 1 file duy nhat

