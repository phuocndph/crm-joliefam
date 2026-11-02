// Synthetic contracts only: injected provider, no credentials, environment files or DB.
import assert from 'node:assert/strict';
import {buildGhnQuoteSnapshot,eligibleGhnServices,compareGhnShopQuotes,createGhnQuoteSession} from '../src/lib/ghn-quote-comparison.ts';
import {ghnChargeableWeightGrams,ghnTotalChargeableWeightGrams} from '../src/lib/ghn-parcel-weight.ts';
import {validateGhnPackedParcel,ghnMultiParcelEvidenceMatches,GhnOrders} from '../server/ghn-orders.ts';
import {ExternalReadAdapters} from '../server/external-read-adapters.ts';
const base={provinceId:'79',districtId:'1444',wardCode:'020308',address:'Synthetic street',cod:0,insurance:0};
const products=[{name:'Product A',quantity:2,weight:200,code:'SKU-A'},{name:'Product B',quantity:1,weight:500}];
const parcels=[{name:'Parcel A',weight:1000,length:30,width:20,height:20},{name:'Parcel B',weight:500,length:10,width:10,height:10}];
const services=[{service_id:53320,service_type_id:2,short_name:'Light'},{service_id:100039,service_type_id:5,short_name:'Heavy'}];
let groups=0;
const check=async(name,run)=>{await run();groups++;console.log('PASS GHN modes: '+name);};
const snapshot=(orderMode,extra={})=>{const built=buildGhnQuoteSnapshot({...base,orderMode,items:products,parcels:orderMode==='HEAVY'?parcels:[{weight:1200,length:20,width:20,height:10}],...extra});assert.ok(built.snapshot,built.error);return built.snapshot;};
await check('chargeable total sums parcel maxima exactly, including fractional fifth-grams',()=>{
  assert.equal(ghnChargeableWeightGrams(parcels[0]),2400);
  assert.equal(ghnTotalChargeableWeightGrams(parcels),2900);
  assert.notEqual(ghnTotalChargeableWeightGrams(parcels),Math.max(1500,2600));
  assert.equal(ghnTotalChargeableWeightGrams(Array.from({length:100},()=>({weight:1,length:1,width:1,height:11}))),220);
  assert.equal(ghnTotalChargeableWeightGrams([{...parcels[0],height:0}]),null);
});
await check('mode chooses service independently of actual weight; real service id retained',()=>{
  for(const weight of [19999,20000,20001])for(const mode of ['LIGHT','HEAVY']){
    const found=eligibleGhnServices(services,weight,1,mode);
    assert.equal(found.length,1);assert.equal(found[0].service_id,mode==='LIGHT'?53320:100039);
  }
  assert.deepEqual(eligibleGhnServices(services,19999,1).map(row=>row.service_type_id),[2]);
  assert.deepEqual(eligibleGhnServices(services,20000,1).map(row=>row.service_type_id),[5]);
});
await check('light root measurements are separate from quantity/unit weight; heavy has no root box',()=>{
  const light=snapshot('LIGHT'),heavy=snapshot('HEAVY');
  assert.equal(light.feeData.weight,1200);assert.deepEqual(light.feeData.items,products);assert.equal(light.feeData.length,20);
  assert.equal(heavy.feeData.weight,1500);assert.equal(heavy.feeData.length,undefined);
  assert.deepEqual(heavy.feeData.items.map(row=>row.name),['Parcel A','Parcel B']);
  assert.equal(snapshot('HEAVY',{parcels:[parcels[0]]}).feeData.length,undefined);
  assert.notEqual(light.key,snapshot('LIGHT',{pickShift:901}).key);
  assert.equal(buildGhnQuoteSnapshot({...base,orderMode:'HEAVY',parcels:Array.from({length:11},()=>({...parcels[0],name:'x'.repeat(200)}))}).snapshot,null);
});
await check('server validates both manifests and requires exact explicit evidence even one heavy parcel',()=>{
  for(const mode of ['LIGHT','HEAVY']){
    const data=snapshot(mode).feeData;
    const order={...data,content:data.items.map(row=>`${row.name}${row.code?' ['+row.code+']':''} × ${row.quantity}`).join(', '),service_type_id:mode==='LIGHT'?2:5,items:data.items.map(row=>({...row,price:0}))};
    validateGhnPackedParcel(order,mode);
    assert.equal(ghnMultiParcelEvidenceMatches(order,order.items,mode),true);
    assert.equal(ghnMultiParcelEvidenceMatches(order,undefined,mode),false);
    assert.equal(ghnMultiParcelEvidenceMatches(order,order.items.map((row,i)=>i?row:{...row,weight:row.weight+1}),mode),false);
    assert.throws(()=>validateGhnPackedParcel({...order,service_type_id:mode==='LIGHT'?5:2},mode));
    if(mode==='HEAVY')assert.throws(()=>validateGhnPackedParcel({...order,length:10},mode));
  }
  const one=snapshot('HEAVY',{parcels:[parcels[0]]}).feeData;
  assert.equal(ghnMultiParcelEvidenceMatches(one,undefined,'HEAVY'),false);
  assert.equal(ghnMultiParcelEvidenceMatches(one,undefined),true,'legacy single evidence unchanged');
});
const calls=[];
const config={configured:true,mode:'ENABLED',revision:1,token:'synthetic-only-modes',primaryShop:'123',shops:['123']};
const json=data=>new Response(JSON.stringify({code:200,data}));
const provider=async(raw,init={})=>{
  const url=new URL(raw),path=url.pathname;const body=init.body?JSON.parse(init.body):null;calls.push({path,body,method:init.method});
  if(path.endsWith('/v2/shop/all'))return json({shops:[{_id:123,status:1,district_id:1452,ward_code:'010101'}],last_offset:0});
  if(path.endsWith('/province/all'))return json([{_id:79,name:'Synthetic province',extension_names:[]}]);
  if(path.endsWith('/ward/all-by-province-id'))return json([{_id:100,parent_id:79,name:'Synthetic ward',extension_names:[]}]);
  if(path.endsWith('/v2/shift/date')){assert.equal(init.method,'GET');assert.equal(init.body,undefined);return json([{id:901,title:'Tomorrow afternoon',from_time:129600,to_time:151200}]);}
  if(path.endsWith('/fee'))return json({total:25000});
  if(path.endsWith('/preview'))return json({order_code:'',total_fee:27000});
  throw Error('Unexpected endpoint '+path);
};
const adapter=new ExternalReadAdapters({},provider,async()=>config);
await check('fee adapter forwards exact measured manifests and strips internal mode',async()=>{
  for(const mode of ['LIGHT','HEAVY']){
    const data=snapshot(mode).feeData,service=services.find(row=>row.service_type_id===(mode==='LIGHT'?2:5));
    await adapter.ghn({action:'calculate_fee',shopId:'123',orderMode:mode,feeData:{...data,service_id:service.service_id,service_type_id:service.service_type_id}});
    const sent=calls.at(-1).body;assert.equal(sent.orderMode,undefined);assert.equal(sent.weight,data.weight);assert.deepEqual(sent.items,data.items);
    assert.equal(sent.service_id,service.service_id);assert.equal(sent.length,data.length);
  }
  assert.equal((await adapter.ghn({action:'get_pick_shifts'})).data[0].to_time,151200,'relative seconds retained');
});
await check('NEW2 preview accepts both modes, verifies pickup membership and never dispatches create',async()=>{
  const pool={query:async sql=>{assert.ok(sql.includes('local_user_profiles'));return{rows:[{role:'admin'}]};}};
  const api=new GhnOrders(pool,adapter,provider);
  for(const mode of ['LIGHT','HEAVY']){
    const data=snapshot(mode).feeData;
    const request={orderMode:mode,idempotencyKey:'12345678-1234-4123-8123-123456789012',shopId:'123',provinceId:79,addressMode:'NEW2',newWardId:100,orderData:{to_name:'Synthetic recipient',to_phone:'0900000000',to_address:'Synthetic street',weight:data.weight,...(data.length?{length:data.length,width:data.width,height:data.height}:{}),cod_amount:0,insurance_value:0,content:data.items.map(row=>`${row.name}${row.code?' ['+row.code+']':''} × ${row.quantity}`).join(', '),payment_type_id:2,required_note:'KHONGCHOXEMHANG',service_type_id:mode==='LIGHT'?2:5,pick_shift:[901],items:data.items.map(row=>({...row,price:0}))}};
    assert.equal((await api.preview('synthetic-admin',request)).total,27000);
    assert.equal(calls.at(-1).body.is_new_to_address,true);assert.equal(calls.at(-1).body.service_id,undefined);
    await assert.rejects(()=>api.preview('synthetic-admin',{...request,orderData:{...request.orderData,pick_shift:[999]}}),/Ca lấy hàng/);
  }
  assert.equal(calls.some(row=>row.path.endsWith('/create')),false);
});
await check('NEW2 comparison uses type-only service and legacy preliminary remains supported',async()=>{
  const session=createGhnQuoteSession(async(action)=>{assert.equal(action,'preview_new_address');return{total:19000};});
  const data=snapshot('HEAVY',{addressMode:'NEW2',wardCode:'100',newAddress:{newWardId:100}});
  const compared=await compareGhnShopQuotes(session,[{_id:123,name:'Synthetic',address:'Fake',district_id:1452}],data);
  assert.equal(compared.quotes[0].service.service_id,undefined);assert.equal(compared.quotes[0].service.service_type_id,5);
});
console.log('GHN_ORDER_MODES_PASS '+JSON.stringify({groups,network:'injected synthetic only',database:'none'}));
