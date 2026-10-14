# PAYROLL SPRINT 1 - EXCEL PRODUCT MAPPING DRY RUN

Generated at: 2026-09-07T00:29:10+07:00
Source workbook: Copy of luong_2026 (1).xlsx
Review owner: Chủ hệ thống CRM

## 1. Execution boundary

- Read-only workbook inspection.
- Exact normalized SKU matching only. No fuzzy matching, name guessing or automatic merge.
- No database connection and no database write.
- Bank account values are never printed by this report.

## 2. Workbook integrity proof

- SHA-256 before: DAAE28839215C41E3817096E181E9F84A2541158EDCF8D47550CB6AF1FFCA1C6
- SHA-256 after: DAAE28839215C41E3817096E181E9F84A2541158EDCF8D47550CB6AF1FFCA1C6
- Source unchanged: YES

## 3. Product mapping summary

| Metric | Result |
|---|---:|
| Source rows | 126 |
| Valid source rows | 126 |
| Unique valid source codes | 126 |
| Duplicate source rows | 0 |
| Invalid source rows | 0 |
| Catalog rows | 1773 |
| Catalog rows missing SKU | 0 |
| Mapped exact | 1 |
| Ambiguous | 0 |
| Missing | 125 |
| Not measured | 0 |

Mapping verdict: **REVIEW REQUIRED - NOT APPROVED FOR IMPORT**

## 4. Bank account identifier safety

All account identifiers must enter PostgreSQL as text. Numeric Excel cells are flagged because any leading zero already lost in Excel cannot be reconstructed automatically.

| Sheet | Nonblank identifiers | Text cells | Numeric cells | Formula/other |
|---|---:|---:|---:|---:|
| luong_tong | 109 | 61 | 48 | 0 |
| nv đóng bhxh | 9 | 7 | 2 | 0 |

## 5. Catalog input contract

Provide a sanitized UTF-8 JSON/CSV export with at least id, sku and name. Include price_list_id, price_list_name and price_list_year so duplicate SKU values across price lists remain visible.

## 6. Detailed source rows

| Excel row | Code | Product name | Rate (VND) | Source note | Source validation | Mapping | CRM candidate | Review owner |
|---:|---|---|---:|---|---|---|---|---|
| 2 | vgv | vỏ gối vuông | 2500 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 3 | vgbd | vỏ gối viền băng dệt xung quanh | 3500 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 4 | vglbbn | Vỏ gối lót bông các loại vải | 4000 | ( dành cho bn) | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 5 | vgl | Vỏ gối vải lụa | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 6 | vgtt2 | Vỏ gối trang trí can 2 cạnh | 3500 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 7 | vgtt4 | Vỏ gối TT mí 4 góc | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 8 | vgolb | Vỏ gối ôm lụa thêm bèo | 7000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 9 | vgol | Vỏ gối ôm lụa | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 10 | vgo | Vỏ gối ôm | 3000 | - | VALID | MAPPED | 9c382c42-50cd-4de6-b7e7-b0699966ecb7 / Vỏ gối ôm / Từ 01/5 Năm 2025 Đến Nay 2025 | - |
| 11 | vgte | Vỏ gối nằm trẻ em | 2500 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 12 | vg3l | vỏ gối lụa kẹp 3 lá | 6000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 13 | vglmicro | vỏ gối lé bông micro+hộp | 4000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 14 | vgdhn | vỏ gối diễu | 3500 | Dành cho hn | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 15 | vgcl | vỏ gối có lé | 8000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 16 | vgcskl | Vỏ gối cao su không lé | 4000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 17 | vgcscl | Vỏ gối cao su có lé | 6000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 18 | vgcs | vỏ gối cao su | 4000 | hay dùng | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 19 | vgbt | Vỏ gối bì thư | 2000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 20 | vdg3 | vỏ đệm gấm 3 mảnh | 30000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 21 | vdg1 | vỏ đệm gấm 1 mảnh | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 22 | vd3at | Vỏ đệm 3 mảnh gấm xốp ghi a tuấn | 30000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 23 | vd3dx | vỏ đệm 3 mảnh đệm xinh | 40000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 24 | vd3m | vỏ đệm 3 mảnh | 30000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 25 | vd21at | vỏ đệm 2+1 mảnh gấm xốp ghi a tuấn | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 26 | vd21 | vỏ đệm 2 mảnh và 1 mảnh | 20000 | dùng cho khách lẻ | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 27 | vd2mat | vỏ đệm 2 mảnh (1 mặt xanh 1 mặt gấm trắng ) a tuấn | 40000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 28 | vdth | Vỏ đệm  thun | 12000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 29 | vcn | Vỏ chăn nhám | 14000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 30 | vcl3llbz | Vỏ chăn lụa 3 lá lót bông may thêm zen | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 31 | vcl3llb | vỏ chăn lụa 3 lá lot bông | 18000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 32 | vcl3l | Vỏ chăn lụa 3 lá | 15000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 33 | vckllb | vỏ chăn khóa lé lot bông | 23000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 34 | vckl | Vỏ chăn khóa lé | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 35 | vck2l | vỏ chăn khóa 2 lỗ | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 36 | vck | Vỏ chăn khóa | 8000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 37 | vcchvs | Vỏ chăn chần có vắt sổ trong | 15000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 38 | vclbtv | vỏ chăn a tuấn vinh | 18000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 39 | c3lcllb | Vỏ chăn 3 lá can lé lót bông | 22000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 40 | vgspa | Váy giường spa | 12000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 41 | vg | Váy gường | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 42 | tgo | túi gối ôm | 3000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 43 | tgcs | túi gối cao su (mặt ghi mặt bóng) | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 44 | tdct | túi đựng chống thấm ( nhà anh tuấn) | 750 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 45 | tgg | túi đụng ga gối | 1500 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 46 | tttchb | tấm trang trí trần bông | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 47 | ttt4 | Tấm trang trí mí 4 cạnh | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 48 | ttt2 | Tấm trang trí mí 2 cạnh | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 49 | rgmm | ruột gối mí micro | 3000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 50 | rcmcl | ruột chăn micro có lé | 60000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 51 | rcmkl | ruột chăn micro ko lé | 50000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 52 | rd | Ri đô | 6000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 53 | rkl | rèm không là | 25000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 54 | rkc | Rèm không cắt | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 55 | rcc | Rèm có cắt | 30000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 56 | rbv | Rèm bệnh viện | 3000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 57 | ncv | nơ chun vàng | 6000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 58 | topper | may vỏ topper | 12000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 59 | kbxl | khăn bàn xếp ly | 12000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 60 | kbz | Khăn bàn may zen | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 61 | kb | khăn bàn | 4000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 62 | ka | khăn ăn | 1500 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 63 | gb | Gối bèo | 7000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 64 | gtpxg | ga tấm phủ xẻ góc LTH | 12000 | A tuấn vinh | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 65 | gtpc2b | ga tấm phủ can 2 bên | 7000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 66 | gtpcc4g | ga tấm phủ cài chun 4 góc | 7000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 67 | gtp | Ga tấm phủ | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 68 | gpxl | ga phủ xếp ly | 15000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 69 | gnlth | ga nhún lụa tổng hợp | 15000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 70 | gdcl | Ga may dấu chun lụa | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 71 | glxg | ga lụa xẻ góc | 30000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 72 | glcd | Ga lụa chần đĩa ( ga phủ đĩa) vải micro | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 73 | glch | ga lụa chần | 15000 | vải hq thêm 1 k | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 74 | gl | Ga lé | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 75 | gdcxc | ga dấu chun xoa can (lth) | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 76 | gdcx | Ga dấu chun vải xoa (lth) | 8000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 77 | gcv | Ga chun viền | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 78 | gctrc | ga chun tròn can | 11000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 79 | gcll | ga chun luồn lụa | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 80 | gclc | ga chun luồn can | 11000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 81 | gcb1 | ga chun luồn bé dưới 1m (T) | 6000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 82 | gcl | ga chun luồn | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 83 | gccc | Ga chun can cạnh | 6000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 84 | gcb1c | ga chun bé luồn dưới 1m can (T) | 7000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 85 | gcbc | ga chun bé can | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 86 | gcb | ga chun bé | 3000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 87 | gctcc | Ga chống thấm chun can | 6000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 88 | gctc | Ga chống thấm chun | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 89 | gctchkd | ga chống thấm chần không đai | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 90 | gctchcd | ga chống thấm chần có đai | 6000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 91 | gctcd | Ga chống thấm cài đai | 6000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 92 | gchx | Ga chần vải xoa | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 93 | chanhe | Chăn hè/ruột chăn | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 94 | chtre | chăn hè tre em | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 95 | chm | chăn hè micro | 30000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 96 | chanhe7 | chăn hè diễu 7f | 12000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 97 | at | Áo tắm | 17000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 98 | agtre | áo gối trẻ em | 1000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 99 | agoi4 | áo gối mí 4 cạnh | 3000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 100 | agk | Áo gối khóa | 2000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 101 | AGV | Áo ghế màu vàng có xếp ly  và nơ không chạy chân | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 102 | agkx | áo ghế không xén | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 103 | ag00 | Áo ghế | 9000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 104 | gchtv | ga chần a tuấn vinh | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 105 | vcklkk3l | vỏ chăn khoá lót không kẹp 3 lá | 11000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 106 | rem | rèm vải | 25000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 107 | remv | rèm voan | 25000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 108 | remo | rèm vải o rê | 22000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 109 | srem1h | sửa 1h | 35000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 110 | yem | Yếm | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 111 | channi | chăn nỉ học sinh | 10000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 112 | gchb | ga chần bé học sinh | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 113 | chanhech | chăn hè chần học sinh | 7000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 114 | gtrhs | ga chần học sinh | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 115 | gcttr | ga chống thấm tròn | 7000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 116 | kbtr | khăn bàn tròn | 15000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 117 | vckvbd | vỏ chăn khoá viền băng dệt | 15000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 118 | vqbxl | váy quây bàn xếp ly | 15000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 119 | mvch | may vỏ chăn hè chay máy (bỏ) | 4000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 120 | agct | áo gối chống thấm | 2000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 121 | vglb | vỏ gối lót bông+diễu | 5000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 122 | chanhe1 | chăn hè (giá mới) | 12000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 123 | topper1 | may vỏ topper(giá mới) | 15000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 124 | chanhecm | chăn hè micro chạy máy t233(gim+lại mũi) | 20000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 125 | vcd | vỏ chăn đáp | 16000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 126 | ch3dcm | chăn hè 3d chạy máy(vải rẻ) | 15000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |
| 127 | srem | sửa 1h (giá mới ) | 40000 | - | VALID | MISSING | Khong co exact SKU | Chủ hệ thống CRM |

## 7. Next acceptance step

Resolve every SOURCE_REVIEW, AMBIGUOUS and MISSING row with an explicit product identity. Do not use fuzzy mapping or create duplicate products.

