## Kết quả kiểm tra

- Bảng giá **“Từ 01/5 Năm 2025 Đến Nay”** hiện có **920 sản phẩm** trong database.
- Lỗi ảnh chụp **`Requested range not satisfiable | PGRST103`** xảy ra khi app đang yêu cầu một trang sản phẩm vượt quá số trang hợp lệ của kết quả hiện tại.
- Nguyên nhân rất có khả năng nằm ở logic phân trang trong `ProductManagement.tsx`: khi đổi bảng giá / bộ lọc, code vừa reset `currentPage` về 1 vừa gọi tải sản phẩm ngay, nên có lúc vẫn dùng số trang cũ để `.range(...)`.

## Kế hoạch sửa

1. **Sửa logic tải sản phẩm**
   - Chỉ gọi `fetchProducts` khi đã có `user`.
   - Khi đổi bảng giá, tìm kiếm, danh mục hoặc tình trạng: reset về trang 1 rồi để effect phân trang tải lại dữ liệu bằng trang mới.
   - Tránh gọi tải sản phẩm bằng `currentPage` cũ.

2. **Chặn trang vượt quá tổng số trang**
   - Sau khi biết `count`, nếu `currentPage > totalPages`, tự đưa về trang cuối hợp lệ thay vì để Supabase trả `PGRST103`.
   - Nếu bảng giá có 920 sản phẩm và 50 sản phẩm/trang, app sẽ chỉ cho phép trang 1–19.

3. **Cải thiện xử lý lỗi PGRST103**
   - Nếu vẫn gặp `PGRST103`, app sẽ tự reset về trang 1 và tải lại thay vì chỉ hiện toast lỗi đỏ.
   - Giữ toast lỗi chi tiết cho các lỗi thật khác.

4. **Kiểm tra lại**
   - Mở trang Quản lý sản phẩm với bảng giá “Từ 01/5 Năm 2025 Đến Nay”.
   - Xác nhận hiển thị được 920 sản phẩm theo phân trang và không còn toast `Requested range not satisfiable`.