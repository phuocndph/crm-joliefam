import assert from "node:assert/strict";
import {
  localSelectResult,
  sliceLocalRows,
  validateLocalMutationFilters,
} from "../src/integrations/supabase/local-query-compat";

const rows = Array.from({ length: 150 }, (_, id) => ({ id }));

assert.equal(sliceLocalRows(rows).length, 150, "omitted limit must not truncate rows");
assert.deepEqual(sliceLocalRows(rows, { limit: 25 }).map((row) => row.id), Array.from({ length: 25 }, (_, id) => id));
assert.deepEqual(sliceLocalRows(rows, { offset: 100, limit: 20 }).map((row) => row.id), Array.from({ length: 20 }, (_, id) => id + 100));
assert.equal(localSelectResult(rows, rows.length, { count: true }).count, 150);
assert.equal(localSelectResult(rows, rows.length, { head: true, count: true }).data, null);
assert.equal(localSelectResult(rows, rows.length, { head: true, count: true }).count, 150);
assert.equal(localSelectResult([rows[0]], 1, { one: true }).data?.id, 0);
assert.equal(localSelectResult([], 0, { maybeOne: true }).data, null);
assert.equal(localSelectResult(rows.slice(0, 2), 2, { one: true }).error?.code, "PGRST116");

assert.equal(
  validateLocalMutationFilters("products", "delete", [{ kind: "eq", column: "price_list_id", value: "list-a" }]).kind,
  "products-price-list",
);
assert.throws(
  () => validateLocalMutationFilters("products", "delete", [
    { kind: "eq", column: "id", value: "product-a" },
    { kind: "eq", column: "price_list_id", value: "list-a" },
  ]),
  /đúng một bộ lọc/,
);

console.log("Local query compatibility tests passed: uncapped reads, range/limit, cardinality, count and fail-closed mutations.");
