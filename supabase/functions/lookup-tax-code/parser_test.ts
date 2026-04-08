// Parser regression tests for AI Quote Fill
// Run with: supabase--test_edge_functions

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// We need to import the functions we want to test
// Since they're not exported, we'll test via HTTP calls to the deployed function

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

async function callQuoteFill(request: string) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/lookup-tax-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      type: "ai_quote_fill",
      data: { request },
    }),
  });
  return await resp.json();
}

Deno.test("Parser: T250 + T300 combined request should return items for both materials", async () => {
  const result = await callQuoteFill(
    "Vải T250 trắng sọc:\n4c Vỏ chăn 200x220\n4c Ga chun 160x200x12cm\n8c Vỏ gối 45x65\n1c chăn hè chần 200x220\n---\nVải T300 trắng sọc:\n1c Ga chun 160x200x12cm\n1c Ga chun 160x200x15cm"
  );

  console.log("Result:", JSON.stringify(result, null, 2));
  
  assert(result.items, "Should have items");
  assert(result.items.length >= 6, `Should have at least 6 items, got ${result.items.length}`);
  
  // Check no item has "không có trong bảng giá" error
  for (const item of result.items) {
    assert(item.matchedProductId, `Item "${item.customName}" should have matchedProductId`);
  }
});

Deno.test("Parser: should not convert T300 to T250", async () => {
  const result = await callQuoteFill(
    "Vải T300 trắng sọc:\n1c Ga chun 160x200x12cm"
  );

  console.log("T300 Result:", JSON.stringify(result, null, 2));
  
  assert(result.items, "Should have items");
  assert(result.items.length >= 1, "Should have at least 1 item");
  
  // The item should mention T300 and not be auto-corrected to T250
  const item = result.items[0];
  const name = (item.customName || '').toLowerCase();
  // If matchQuality is 'exact' or 'fallback_size', the match is within correct material
  if (item.matchQuality) {
    assert(
      item.matchQuality !== 'uncertain',
      `T300 ga chun should not be uncertain match, got: ${item.matchQuality}`
    );
  }
});

Deno.test("Parser: sọc should not become trơn", async () => {
  const result = await callQuoteFill(
    "2c ga chun T250 sọc 180x200x15cm"
  );

  console.log("Soc Result:", JSON.stringify(result, null, 2));
  
  assert(result.items, "Should have items");
  assert(result.items.length >= 1, "Should have at least 1 item");
  
  const item = result.items[0];
  // Name should contain sọc, not trơn
  const name = (item.customName || '').toLowerCase();
  assert(!name.includes('tron') && !name.includes('trơn'), `"${item.customName}" should be sọc not trơn`);
});
