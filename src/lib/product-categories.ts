export interface ProductCategoryRow { id: string; category: string | null }

/** Category filters read the whole price list, never the visible product page. */
export async function collectProductCategories(
  readPage: (offset: number, pageSize: number) => PromiseLike<{ data: ProductCategoryRow[] | null; error: { message: string } | null }>,
  signal: AbortSignal,
) {
  const categories = new Set<string>();
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    if (signal.aborted) throw new DOMException('Đã hủy tải danh mục.', 'AbortError');
    const { data, error } = await readPage(offset, pageSize);
    if (signal.aborted) throw new DOMException('Đã hủy tải danh mục.', 'AbortError');
    if (error) throw new Error(error.message || 'Không thể tải danh mục sản phẩm.');
    const rows = data || [];
    for (const row of rows) {
      // Preserve exact stored values because the product query uses category equality.
      if (typeof row.category === 'string' && row.category.trim()) categories.add(row.category);
    }
    if (rows.length < pageSize) break;
  }
  return [...categories].sort((a, b) => a.localeCompare(b, 'vi') || (a < b ? -1 : a > b ? 1 : 0));
}
