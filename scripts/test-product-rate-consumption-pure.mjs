import assert from 'node:assert/strict';
import {assertRuntimePieceRate,canonicalRateCandidates,listRuntimePieceRates,resolveRuntimePieceRate} from '../server/product-rate-consumption.ts';

const row=(overrides={})=>({
  id:'a1111111-1111-4111-8111-111111111111',product_id:'b2222222-2222-4222-8222-222222222222',
  piece_rate_code:'MÃ MAY',piece_rate_name:'May hoàn thiện',rate_exact:'12500.00',rate_unit:'PIECE',
  effective_from:'2026-01-01',effective_to:null,...overrides,
});
const error=(fn,pattern)=>assert.throws(fn,value=>value?.status===409&&pattern.test(String(value.message)));
const tests=[];
const check=(name,body)=>{body();tests.push(name);};

check('one-effective-piece-source-selects-exact-row',()=>{
  const selected=resolveRuntimePieceRate([row()],{date:'2026-10-30',rateId:row().id,productId:row().product_id,pieceRateCode:' mã may '});
  assert.equal(selected.id,row().id);assert.equal(selected.rate_exact,'12500.00');assert.equal(selected.rate_unit,'PIECE');
});
check('same-canonical-code-blocks-rate-and-product-aliases',()=>{
  const rows=[row(),row({id:'c3333333-3333-4333-8333-333333333333',product_id:'d4444444-4444-4444-8444-444444444444',piece_rate_code:' mã may '})];
  for(const identity of [{rateId:rows[0].id},{rateId:rows[0].id.toUpperCase()},{productId:rows[0].product_id},{productId:rows[0].product_id.toUpperCase()},{productId:rows[0].id},{productId:rows[0].id.toUpperCase()},{pieceRateCode:'MÃ MAY'}])error(()=>resolveRuntimePieceRate(rows,{date:'2026-10-30',...identity}),/nhiều đơn giá/i);
  assert.equal(listRuntimePieceRates(rows).length,0);
});
check('unicode-nfc-and-whitespace-collide-before-filtering',()=>{
  const rows=[row({piece_rate_code:'MÃ ÁO'}),row({id:'33333333-3333-4333-8333-333333333333',piece_rate_code:' ma\u0303 a\u0301o '})];
  assert.equal(canonicalRateCandidates(rows,'MÃ ÁO').length,2);
  error(()=>resolveRuntimePieceRate(rows,{date:'2026-10-30',pieceRateCode:'mã áo'}),/nhiều đơn giá/i);
});
check('all-supplied-identities-must-agree',()=>{
  const source=row(),other=row({id:'c3333333-3333-4333-8333-333333333333',piece_rate_code:'MÃ KHÁC',product_id:'d4444444-4444-4444-8444-444444444444'});
  error(()=>resolveRuntimePieceRate([source,other],{date:'2026-10-30',rateId:source.id,pieceRateCode:other.piece_rate_code}),/không khớp/i);
  error(()=>resolveRuntimePieceRate([source,other],{date:'2026-10-30',pieceRateCode:source.piece_rate_code,productId:other.product_id}),/Sản phẩm không khớp/i);
  error(()=>resolveRuntimePieceRate([source],{date:'2026-10-30',pieceRateCode:'MÃ KHÔNG TỒN TẠI',productId:source.product_id}),/chưa có đơn giá/i);
});
check('uppercase-uuid-aliases-match-without-changing-canonical-code-rules',()=>{
  const source=row(),other=row({id:'c3333333-3333-4333-8333-333333333333',piece_rate_code:'MÃ KHÁC',product_id:'d4444444-4444-4444-8444-444444444444'});
  assert.notEqual(source.id.toUpperCase(),source.id);assert.notEqual(source.product_id.toUpperCase(),source.product_id);
  for(const identity of [
    {rateId:source.id.toUpperCase()},
    {productId:source.product_id.toUpperCase()},
    {productId:source.id.toUpperCase()},
    {rateId:source.id.toUpperCase(),productId:source.product_id.toUpperCase(),pieceRateCode:' mã may '},
  ]) assert.equal(resolveRuntimePieceRate([source],{date:'2026-10-30',...identity}).id,source.id);
  error(()=>resolveRuntimePieceRate([source,other],{date:'2026-10-30',rateId:source.id.toUpperCase(),productId:other.product_id.toUpperCase(),pieceRateCode:source.piece_rate_code}),/Sản phẩm không khớp/i);
});
check('generic-uuid-comparison-keeps-nil-and-nonv4-identities-compatible',()=>{
  const nil=row({id:'00000000-0000-0000-0000-000000000000',product_id:'00000000-0000-0000-0000-000000000001'});
  const nonV4=row({id:'a0000000-0000-6000-7000-000000000000',product_id:'b0000000-0000-8000-7000-000000000000'});
  assert.equal(resolveRuntimePieceRate([nil],{date:'2026-10-30',rateId:nil.id,productId:nil.product_id}).id,nil.id);
  assert.notEqual(nonV4.id.toUpperCase(),nonV4.id);
  assert.equal(resolveRuntimePieceRate([nonV4],{date:'2026-10-30',rateId:nonV4.id.toUpperCase(),productId:nonV4.product_id.toUpperCase()}).id,nonV4.id);
});
check('product-only-multiple-codes-never-picks-latest',()=>{
  const source=row(),other=row({id:'c3333333-3333-4333-8333-333333333333',piece_rate_code:'MÃ KHÁC'});
  error(()=>resolveRuntimePieceRate([source,other],{date:'2026-10-30',productId:source.product_id}),/nhiều mã công/i);
});
check('runtime-rejects-nonpiece-zero-and-invalid-name',()=>{
  for(const invalid of [row({rate_unit:'SET'}),row({rate_unit:' piece '}),row({rate_exact:'0.00'}),row({piece_rate_name:'   '})])error(()=>assertRuntimePieceRate([invalid]),/PIECE|số dương|tên/i);
});

console.log(JSON.stringify({suite:'product-rate-consumption-pure',passed:tests.length,cases:tests,api_calls:0,database_calls:0,source_writes:0}));
