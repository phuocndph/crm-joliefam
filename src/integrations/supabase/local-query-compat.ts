export type LocalQueryWindow = {
  offset?: number;
  limit?: number;
};

export type LocalSelectOptions = {
  one?: boolean;
  maybeOne?: boolean;
  head?: boolean;
  count?: boolean;
};

/** Apply PostgREST-compatible slicing. An omitted limit means no implicit cap. */
export function sliceLocalRows<T>(rows: T[], window: LocalQueryWindow = {}): T[] {
  const offset = Math.max(0, Math.trunc(window.offset ?? 0));
  if (window.limit === undefined) return rows.slice(offset);
  return rows.slice(offset, offset + Math.max(0, Math.trunc(window.limit)));
}

export function localSelectResult<T>(rows: T[], total: number, options: LocalSelectOptions = {}) {
  if (options.one || options.maybeOne) {
    if (rows.length > 1 || (options.one && rows.length !== 1)) {
      return {
        data: null,
        error: {
          code: "PGRST116",
          message: rows.length ? "Truy vấn trả về nhiều hơn một bản ghi." : "Không tìm thấy bản ghi.",
        },
      };
    }
    return { data: rows[0] ?? null, error: null };
  }
  return { data: options.head ? null : rows, error: null, count: options.count ? total : undefined };
}

export type LocalMutationFilter = { kind: string; column: string; value?: unknown };

/** Fail closed when a local mutation contains filters the endpoint cannot enforce. */
export function validateLocalMutationFilters(
  table: string,
  mode: "update" | "delete",
  filters: LocalMutationFilter[],
) {
  const isProductPriceListDelete = mode === "delete" && table === "products"
    && filters.length === 1 && filters[0].kind === "eq" && filters[0].column === "price_list_id";
  if (isProductPriceListDelete) return { kind: "products-price-list" as const, value: filters[0].value };
  if (filters.length !== 1) {
    throw new Error("Local ghi dữ liệu chỉ hỗ trợ đúng một bộ lọc được máy chủ thực thi.");
  }
  const filter = filters[0];
  if (filter.kind === "eq" && filter.column === "id") return { kind: "id" as const, value: filter.value };
  if (mode === "delete" && filter.kind === "in" && filter.column === "id") return { kind: "ids" as const, value: filter.value };
  if (mode === "delete" && filter.kind === "eq" && ["order_id", "config_key", "setting_name"].includes(filter.column)) {
    return { kind: "natural" as const, value: filter.value, column: filter.column };
  }
  throw new Error(`Local API chưa hỗ trợ bộ lọc ${filter.column} cho thao tác ${mode}.`);
}
