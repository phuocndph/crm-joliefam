

# Nang cap Bao cao & Thong ke chi tiet

## Pham vi thay doi

Chi thay doi 1 file: `src/pages/ReportsPage.tsx` (1106 dong hien tai). Tach thanh cac component con de de quan ly, hoac giu nguyen 1 file nhung bo sung noi dung vao cuoi moi tab.

Khong can thay doi database. Tat ca du lieu da co san tu cac query hien tai (orders, customers, expenses, orderPayments). Chi can them 1 query moi: fetch `assignees` de hien thi ten nhan vien.

## Cac nang cap cu the

### Tab 1: Tong quan - Bo sung

- **Phan bo trang thai don hang chi tiet**: Bang hien thi 6 trang thai (pending, confirmed, producing, shipping, delivered, cancelled) voi so luong, ty le %, tong gia tri
- **Top 10 san pham ban chay**: Parse `items` JSON tu filteredOrders, gom nhom theo `name`/`sku`, tinh tong so luong va doanh thu
- **Top 10 khach hang theo doanh thu**: Bang hien thi khach hang co doanh thu cao nhat, so don, gia tri TB/don

### Tab 2: Ban hang - Bo sung

- **Bieu do cot doanh thu theo thang** (BarChart) ben canh PieChart hien tai
- **Bang top 10 san pham ban chay**: Ten SP, SKU, so luong ban, doanh thu, % tong doanh thu
- **Doanh thu theo nhan vien (assignee)**: Fetch assignees, join voi filteredOrders qua `assignee_id`, hien thi bang doanh thu/nhan vien
- **Phan bo trang thai don hang chi tiet** voi bang va so lieu

### Tab 3: Tai chinh - Bo sung

- **Chi phi theo danh muc**: Group filteredExpenses theo truong `category`, hien thi bang + PieChart
- **Bieu do dong tien theo thang** (AreaChart): Thu (revenue) vs Chi (expenses) vs Loi nhuan rong
- **Tien do thu tien chi tiet**: Tong gia tri don, da thu, con lai, ty le thu (%) voi progress bar
- **Bang thanh toan chi tiet**: Don hang chua thanh toan du, hien thi ten KH, ma don, tong gia tri, da thu, con lai

### Tab 4: Khach hang - Bo sung

- **Top 10 khach hang theo doanh thu**: Ten, ma KH, so don, tong doanh thu, don TB
- **Phan loai khach hang**: VIP (>10 don hoac >50tr), Thuong xuyen (3-10 don), Moi (<3 don) - hien thi so luong va ty le voi PieChart
- **Khach hang chua mua lai**: Danh sach khach hang co `purchase_count` = 1 va `last_purchase_date` > 90 ngay truoc

## Cach tiep can ky thuat

- Them 1 query `useQuery` moi cho `assignees`
- Them ~8 `useMemo` hooks moi de tinh toan: topProducts, topCustomers, orderStatusBreakdown, expensesByCategory, revenueByAssignee, customerSegmentation, unpaidOrdersDetail, cashFlowMonthly
- Giu nguyen toan bo code hien tai, chi them noi dung moi vao cuoi moi `TabsContent`
- Su dung cac component UI da co: Table, Card, BarChart, PieChart, AreaChart tu recharts

