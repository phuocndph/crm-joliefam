// Independent adversarial service checks, with a new disposable PostgreSQL
// container and an injected synthetic GHN transport. No .env or real provider.
// Run only against the reviewed fixed diff: node --import tsx scripts/test-ghn-orders-independent.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import express from 'express';
import pg from 'pg';
import { GhnOrders, registerGhnOrders } from '../server/ghn-orders.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';
import { moduleRequirement } from '../server/module-permissions.ts';

const container = `ghn-independent-fixture-${process.pid}-${Date.now()}`;
assert.match(container, /^ghn-independent-fixture-\d+-\d+$/);
const password = randomBytes(24).toString('hex');
let pool, started = false;
const checks = [];
const check = async (name, action) => {
  try { await action(); checks.push(name); }
  catch (error) { console.error('GHN_INDEPENDENT_FAILED ' + JSON.stringify({ check: name, completed: checks })); throw error; }
};
const docker = args => {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Disposable test container command failed (${args[0]}).`);
  return result.stdout.trim();
};
const reject = (action, status) => assert.rejects(action, error => status ? error?.status === status : true);
const config = { token: 'synthetic-provider-token', primaryShop: '123', shops: ['123', '456'], configured: true, source: 'saved', mode: 'ENABLED', revision: 1, hasSavedKey: true };
const input = (override = {}) => ({ idempotencyKey: randomUUID(), shopId: '456', orderId: null, orderNumber: 'SYNTHETIC-001', provinceId: 202, orderData: { to_name: 'Synthetic Recipient', to_phone: '0900000003', to_address: '789 Synthetic fixture address', to_district_id: 1444, to_ward_code: '020308', weight: 1000, length: 10, width: 10, height: 10, cod_amount: 100000, insurance_value: 100000, cod_failed_amount: 0, note: '', required_note: 'KHONGCHOXEMHANG', content: 'Synthetic item × 1', payment_type_id: 1, service_type_id: 2, service_id: 53320, items: [{ name: 'Synthetic item × 1', quantity: 1, weight: 1000, length: 10, width: 10, height: 10, price: 0 }] }, ...override });
let createCount = 0, lookupCount = 0, createMode = 'success', lookupMode = 'missing', gate, entered, dispatched;
let lastCreate, changeConfigBeforeDispatch = false, printCount = 0, printMode = 'success', lastPrint, printStreamCancelled = false;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const provider = async (rawUrl, init = {}) => {
  const url = new URL(rawUrl), endpoint = url.pathname.split('/public-api/')[1];
  if (endpoint === 'v2/shop/all') {
    assert.equal(init.method, 'GET');
    return json({ code: 200, data: { shops: [{ _id: 123, name: 'Synthetic 123', district_id: 1452, ward_code: '010101', status: 1 }, { _id: 456, name: 'Synthetic 456', district_id: 1453, ward_code: '010102', status: 1 }], last_offset: 0 } });
  }
  if (endpoint === 'master-data/province') { assert.equal(init.method, 'GET'); return json({ code: 200, data: [{ ProvinceID: 202, ProvinceName: 'Synthetic Province' }] }); }
  if (endpoint === 'master-data/district') { assert.equal(init.method, 'GET'); assert.equal(url.searchParams.get('province_id'), '202'); return json({ code: 200, data: [{ DistrictID: 1444, ProvinceID: 202, DistrictName: 'Synthetic District' }] }); }
  if (endpoint === 'master-data/ward') { assert.equal(init.method, 'GET'); assert.equal(url.searchParams.get('district_id'), '1444'); return json({ code: 200, data: [{ WardCode: '020308', DistrictID: 1444, WardName: 'Synthetic Ward' }] }); }
  if (endpoint === 'v2/shipping-order/available-services') {
    assert.equal(init.method, 'POST'); const body = JSON.parse(init.body);
    assert.equal(body.from_district, body.shop_id === 456 ? 1453 : 1452);
    if (changeConfigBeforeDispatch) { changeConfigBeforeDispatch = false; config.revision++; }
    return json({ code: 200, data: [{ service_id: 53320, service_type_id: 2 },{service_id:100039,service_type_id:5}] });
  }
  if(endpoint==='v2/shift/date'){assert.equal(init.method,'GET');assert.equal(init.body,undefined);return json({code:200,data:[{id:901,title:'Synthetic next shift',from_time:129600,to_time:151200}]});}
  if (endpoint === 'v2/shipping-order/create') {
    createCount++; lastCreate = { body: JSON.parse(init.body), shop: init.headers.ShopId };
    assert.equal(init.method, 'POST'); assert.equal(lastCreate.shop, '456');
    assert.equal(lastCreate.body.from_district_id, 1453);
    assert.equal(lastCreate.body.to_ward_code, '020308');
    assert.equal(lastCreate.body.is_new_to_address, false);
    assert.equal(lastCreate.body.to_province_name, 'Synthetic Province');
    assert.equal(lastCreate.body.to_district_name, 'Synthetic District');
    assert.equal(lastCreate.body.to_ward_name, 'Synthetic Ward');
    if (entered) { entered(); entered = undefined; await gate; }
    if (createMode === 'timeout') throw new TypeError('Synthetic network timeout');
    if (createMode === 'rejected') return json({ code: 400, message: 'Synthetic validation failure' }, 400);
    return json({ code: 200, data: { order_code: `SYNTHETIC${createCount}`, total_fee: 25000, token: 'must-not-be-returned', to_phone: 'must-not-be-returned' } });
  }
  if (endpoint === 'v2/shipping-order/detail-by-client-code') {
    lookupCount++; assert.equal(init.method, 'GET');
    if (lookupMode === 'missing') return json({ code: 404, message: 'Synthetic missing result' }, 404);
    const body = lastCreate.body;
    const data = { ...body, order_code: `SYNTHETIC${createCount}`, shop_id: Number(lastCreate.shop), ...(lookupMode === 'wrong-reference' ? { client_order_code: 'different-reference' } : {}), ...(lookupMode === 'wrong-shop' ? { shop_id: 123 } : {}), ...(lookupMode === 'wrong-recipient' ? { to_phone: '0900000004' } : {}) };
    if (lookupMode === 'missing-failed-cod') delete data.cod_failed_amount;
    if (lookupMode === 'wrong-failed-cod') data.cod_failed_amount = body.cod_failed_amount + 1;
    if (lookupMode === 'null-failed-cod') data.cod_failed_amount = null;
    if (lookupMode === 'missing-items') delete data.items;
    if (lookupMode === 'wrong-items') data.items=data.items.map((row,index)=>index===0?{...row,weight:row.weight+1}:row);
    if (lookupMode === 'missing-content') delete data.content;
    if (lookupMode === 'wrong-content') data.content='Different shared shipment contents';
    if (lookupMode === 'wrong-service-id') data.service_id=Number(data.service_id)+1;
    return json({ code: 200, data });
  }
  if (endpoint === 'v2/a5/gen-token') {
    printCount++; lastPrint = { url: String(rawUrl), init, body: JSON.parse(init.body) };
    assert.equal(String(rawUrl), 'https://online-gateway.ghn.vn/shiip/public-api/v2/a5/gen-token');
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Token, config.token); assert.equal(init.headers.ShopId, '456');
    assert.ok(init.signal instanceof AbortSignal); assert.equal(init.signal.aborted, false);
    assert.deepEqual(lastPrint.body, { order_codes: [`SYNTHETIC${createCount}`] });
    if (printMode === 'network') throw new TypeError('synthetic-provider-token private transport problem');
    if (printMode === 'abort') throw new DOMException('synthetic-provider-token deadline', 'AbortError');
    if (printMode === 'malformed') return new Response('{not-json synthetic-provider-token');
    if (printMode === 'empty') return new Response(null);
    if (printMode === 'oversize') return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2_000_001)); },
      cancel() { printStreamCancelled = true; },
    }));
    if (printMode === 'http400' || printMode === 'http500') return json({ code: 400, message: 'synthetic-provider-token private provider rejection' }, printMode === 'http400' ? 400 : 500);
    if (printMode === 'url-token') return json({ code: 200, data: { token: 'https://attacker.invalid/private-token' } });
    if (printMode === 'short-token') return json({ code: 200, data: { token: 'abc' } });
    if (printMode === 'large-token') return json({ code: 200, data: { token: 'x'.repeat(2049) } });
    return json({ code: 200, data: { token: 'synthetic-print-token-456', ignored: 'must-not-be-returned' } });
  }
  throw new Error('Unexpected synthetic endpoint');
};
const reset = async () => {
  await pool.query('truncate integration_private.ghn_order_attempts,local_ghn_tracking,local_auth_audit_events');
  createMode = 'success'; lookupMode = 'missing'; createCount = 0; lookupCount = 0; gate = undefined; entered = undefined; lastCreate = undefined;
  printCount = 0; printMode = 'success'; lastPrint = undefined; printStreamCancelled = false;
};

try {
  docker(['run', '--detach', '--pull=never', '--name', container, '--label', 'codex.fixture=ghn-independent', '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_USER=ghn_fixture', '--env', 'POSTGRES_DB=ghn_fixture', '--env', `POSTGRES_PASSWORD=${password}`, 'postgres:16-alpine']); started = true;
  const portText = docker(['port', container, '5432/tcp']);
  const port = Number(portText.match(/127\.0\.0\.1:(\d+)/)?.[1]); assert.ok(port);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'ghn_fixture', password, database: 'ghn_fixture', max: 8 });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await pool.query('select 1'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, 'disposable PostgreSQL becomes ready');
  await pool.query(`create schema integration_private;
    create table local_user_profiles(user_id text primary key,is_active boolean not null default true);
    create table local_user_roles(user_id text,role text,assigned_by text,is_active boolean not null default true);
    create table local_employee_permissions(user_id text,permission_type text,enabled boolean);
    create table local_orders(id text primary key,manager_id text,tenant_id text,status text,approval_status text default 'approved');
    create table local_projection_tombstones(source_table text,source_key text);
    create table local_auth_audit_events(entity_type text,entity_id text,action text,actor_id text,reason text,after_data jsonb);
    create table local_ghn_tracking(id text primary key,ghn_order_code text unique,internal_order_code text,order_id text,customer_name text,customer_phone text,customer_address text,package_weight numeric,created_date timestamptz,expected_delivery_date timestamptz,cod_amount numeric,ghn_status text,ghn_status_text text,tracking_url text,raw_data jsonb,manager_id text,tenant_id text,is_snapshot_record boolean,local_modified_at timestamptz,last_updated_at timestamptz);
    insert into local_user_profiles(user_id) values('admin-fixture'),('manager-fixture'),('other-manager'),('employee-fixture'),('inactive-fixture');
    update local_user_profiles set is_active=false where user_id='inactive-fixture';
    insert into local_user_roles(user_id,role,assigned_by) values('admin-fixture','admin',null),('manager-fixture','manager',null),('other-manager','manager',null),('employee-fixture','employee','manager-fixture'),('inactive-fixture','manager',null);
    insert into local_orders(id,manager_id,tenant_id,status) values('order-one','manager-fixture','tenant-one','confirmed'),('order-two','other-manager','tenant-two','confirmed');`);
  await pool.query(await readFile(new URL('../server/db/migrations/062_local_ghn_order_attempts.sql', import.meta.url), 'utf8'));
  const service = new GhnOrders(pool, new ExternalReadAdapters({}, provider, async () => structuredClone(config)), provider);

  await check('module routes require orders/GHN permission', async () => {
    for (const method of ['GET', 'POST']) for (const route of ['/api/ghn-orders', '/api/ghn-orders/recent', '/api/ghn-orders/key/reconcile', '/api/ghn-orders/key/print']) assert.deepEqual(moduleRequirement(method, route), ['ghn_tracking', 'orders']);
  });
  await check('fresh actor and manager/order scope enforced before dispatch', async () => {
    for (const actor of ['local-admin', 'demo-fixture', 'inactive-fixture', 'employee-fixture']) await reject(() => service.create(actor, input()));
    await reject(() => service.create('manager-fixture', input({ orderId: 'order-two' })), 404);
    assert.equal(createCount, 0);
  });
  const fourParcelRequest = () => {
    const request = input({orderId:'order-one',entryMode:'PACKAGES'});
    request.orderData.content='Four measured parcels, total 86 kg';
    request.orderData.service_type_id=5;request.orderData.service_id=100039;
    request.orderData.items=[20000,20000,23000,23000].map((weight,index)=>({name:'Kiện '+(index+1),quantity:1,weight,length:50,width:40,height:40,price:0}));
    request.orderData.weight=86000;
    for(const field of ['length','width','height'])delete request.orderData[field];
    return request;
  };
  await check('pending CRM and approved ZCRM orders create four exact parcels totaling 86kg and replay once',async()=>{
    try{
      for(const approval of [null,'approved']){
        await reset();await pool.query("update local_orders set status='pending',approval_status=$1 where id='order-one'",[approval]);
        const before=(await pool.query("select * from local_orders where id='order-one'")).rows[0];
        const request=fourParcelRequest(),result=await service.create('manager-fixture',request);
        assert.equal(result.data.attempt_status,'SUCCESS');assert.equal(createCount,1);
        assert.equal(lastCreate.body.weight,86000);assert.deepEqual(lastCreate.body.items,request.orderData.items);
        for(const field of ['length','width','height'])assert.equal(lastCreate.body[field],undefined);
        assert.equal(lastCreate.body.service_type_id,5);assert.equal(lastCreate.body.service_id,100039);
        assert.equal((await service.create('manager-fixture',request)).data.order_code,result.data.order_code);assert.equal(createCount,1);
        assert.equal((await pool.query('select package_weight from local_ghn_tracking')).rows[0].package_weight,'86000');
        assert.deepEqual((await pool.query("select * from local_orders where id='order-one'")).rows[0],before,'GHN creation never changes order status or approval');
      }
    }finally{await reset();await pool.query("update local_orders set status='confirmed',approval_status='approved' where id='order-one'");}
  });
  await check('unapproved ZCRM pending orders reject before provider create or journal allocation',async()=>{
    try{
      for(const approval of ['pending','rejected','returned','draft']){
        await reset();await pool.query("update local_orders set status='pending',approval_status=$1 where id='order-one'",[approval]);
        await assert.rejects(()=>service.create('manager-fixture',fourParcelRequest()),error=>error.status===409&&error.code==='ORDER_NOT_APPROVED');
        assert.equal(createCount,0);assert.equal((await pool.query('select count(*)::int n from integration_private.ghn_order_attempts')).rows[0].n,0);
        assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n,0);
      }
    }finally{await reset();await pool.query("update local_orders set status='confirmed',approval_status='approved' where id='order-one'");}
  });
  await check('terminal and unknown order statuses remain blocked before provider create or journal allocation',async()=>{
    try{
      for(const status of ['cancelled','returned','delivered','self_delivered','unknown','',null]){
        await reset();await pool.query("update local_orders set status=$1,approval_status=null where id='order-one'",[status]);
        await reject(()=>service.create('manager-fixture',fourParcelRequest()),409);
        assert.equal(createCount,0);assert.equal((await pool.query('select count(*)::int n from integration_private.ghn_order_attempts')).rows[0].n,0);
        assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n,0);
      }
    }finally{await reset();await pool.query("update local_orders set status='confirmed',approval_status='approved' where id='order-one'");}
  });
  await check('server verifies shop and address; public result excludes private payload', async () => {
    const request = input(), result = await service.create('admin-fixture', request);
    assert.equal(result.data.attempt_status, 'SUCCESS'); assert.equal(createCount, 1);
    assert.equal(JSON.stringify(result).includes('0900000003'), false);
    assert.equal(JSON.stringify(result).includes(config.token), false);
    assert.equal(JSON.stringify(result).includes('must-not-be-returned'), false);
    assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n, 1);
    const again = await service.create('admin-fixture', request); assert.equal(again.data.order_code, result.data.order_code); assert.equal(createCount, 1);
    await reject(() => service.create('admin-fixture', { ...request, orderNumber: 'changed' }), 409);
    await reject(() => service.create('admin-fixture', input({ shopId: '999' })), 403);
    await reject(() => service.create('admin-fixture', { ...input(), orderData: { ...input().orderData, from_district_id: 1452 } }));
  });
  await reset();
  await check('explicit light products and named heavy parcels create, replay and reconcile without duplicate dispatch',async()=>{
    for(const orderMode of ['LIGHT','HEAVY']){
      await reset();
      const request=input({orderMode});
      if(orderMode==='LIGHT'){
        request.orderData.items=[{name:'Synthetic A',quantity:2,weight:200,code:'SKU-A',price:0},{name:'Synthetic B',quantity:1,weight:500,price:0}];
        request.orderData.weight=1200;
        request.orderData.pick_shift=[901];
      }else{
        request.orderData.items=[{name:'Named heavy parcel',quantity:1,weight:1000,length:30,width:20,height:20,price:0}];
        for(const field of ['length','width','height'])delete request.orderData[field];
        request.orderData.service_type_id=5;request.orderData.service_id=100039;
      }
      request.orderData.content=request.orderData.items.map(row=>`${row.name}${row.code?' ['+row.code+']':''} × ${row.quantity}`).join(', ');
      createMode='timeout';
      const result=await service.create('admin-fixture',request);
      assert.equal(result.data.attempt_status,'UNKNOWN');assert.equal(createCount,1);
      assert.equal(lastCreate.body.orderMode,undefined,'mode stays internal');
      assert.deepEqual(lastCreate.body.items,request.orderData.items);
      assert.equal(lastCreate.body.weight,orderMode==='LIGHT'?1200:1000);
      assert.equal(lastCreate.body.length,orderMode==='LIGHT'?10:undefined);
      assert.equal((await service.create('admin-fixture',request)).data.attempt_status,'UNKNOWN');assert.equal(createCount,1);
      for(const evidence of ['missing-items','wrong-items']){lookupMode=evidence;assert.equal((await service.status('admin-fixture',request.idempotencyKey,true)).data.attempt_status,'UNKNOWN');assert.equal(createCount,1);}
      lookupMode='success';assert.equal((await service.status('admin-fixture',request.idempotencyKey,true)).data.attempt_status,'SUCCESS');assert.equal(createCount,1);
      assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n,1);
    }
  });
  await reset();
  await check('PACKAGES accepts both services at every threshold and preserves exact submitted physical manifest',async()=>{
    for(const weight of [19999,20000,20001])for(const serviceType of [2,5]){
      await reset();
      const request=input({entryMode:'PACKAGES'});
      request.orderData.weight=weight;request.orderData.items[0].weight=weight;
      request.orderData.content='Shared contents, entered once';
      request.orderData.items[0].name='Kiện 1';
      request.orderData.service_type_id=serviceType;request.orderData.service_id=serviceType===2?53320:100039;
      if(serviceType===5)for(const field of ['length','width','height'])delete request.orderData[field];
      const result=await service.create('admin-fixture',request);
      assert.equal(result.data.attempt_status,'SUCCESS');assert.equal(createCount,1);
      assert.equal(lastCreate.body.entryMode,undefined,'envelope marker is internal');
      assert.equal(lastCreate.body.service_type_id,serviceType);assert.equal(lastCreate.body.service_id,request.orderData.service_id);
      assert.equal(lastCreate.body.weight,weight);assert.equal(lastCreate.body.length,serviceType===2?10:undefined);
      assert.deepEqual(lastCreate.body.items,request.orderData.items);
      assert.equal(lastCreate.body.content,'Shared contents, entered once');
      assert.equal((await service.create('admin-fixture',request)).data.order_code,result.data.order_code);assert.equal(createCount,1);
      await reject(()=>service.create('admin-fixture',{...request,orderData:{...request.orderData,content:'changed'}}),409);
    }
  });
  await reset();
  await check('PACKAGES multi-parcel cannot use type2/fake combined dimensions and UNKNOWN needs exact evidence',async()=>{
    const request=input({entryMode:'PACKAGES'});
    request.orderData.content='Two physical parcels';request.orderData.service_type_id=5;request.orderData.service_id=100039;
    request.orderData.items=[{name:'Kiện 1',quantity:1,weight:1000,length:30,width:20,height:20,price:0},{name:'Kiện 2',quantity:1,weight:500,length:10,width:10,height:10,price:0}];
    request.orderData.weight=1500;for(const field of ['length','width','height'])delete request.orderData[field];
    await reject(()=>service.create('admin-fixture',{...request,orderData:{...request.orderData,service_type_id:2,service_id:53320}}));
    await reject(()=>service.create('admin-fixture',{...request,orderData:{...request.orderData,length:30,width:20,height:30}}));
    await reject(()=>service.create('admin-fixture',{...request,orderData:{...request.orderData,weight:1499}}));
    assert.equal(createCount,0);
    createMode='timeout';
    assert.equal((await service.create('admin-fixture',request)).data.attempt_status,'UNKNOWN');assert.equal(createCount,1);
    assert.deepEqual(lastCreate.body.items,request.orderData.items);assert.equal(lastCreate.body.length,undefined);
    for(const evidence of ['missing-items','wrong-items','missing-content','wrong-content','wrong-service-id']){lookupMode=evidence;assert.equal((await service.status('admin-fixture',request.idempotencyKey,true)).data.attempt_status,'UNKNOWN');}
    assert.equal((await service.create('admin-fixture',request)).data.attempt_status,'UNKNOWN');assert.equal(createCount,1);
    lookupMode='success';assert.equal((await service.status('admin-fixture',request.idempotencyKey,true)).data.attempt_status,'SUCCESS');assert.equal(createCount,1);
  });
  await reset();
  await check('PACKAGES single2/single5 UNKNOWN is reconciled only by exact manifest with no second dispatch',async()=>{
    for(const type of [2,5]){
      await reset();const request=input({entryMode:'PACKAGES'});
      request.orderData.content='Shared shipment contents';request.orderData.items[0].name='Kiện 1';
      request.orderData.service_type_id=type;request.orderData.service_id=type===2?53320:100039;
      if(type===5)for(const field of ['length','width','height'])delete request.orderData[field];
      createMode='timeout';assert.equal((await service.create('admin-fixture',request)).data.attempt_status,'UNKNOWN');
      for(const evidence of ['missing-items','wrong-items','missing-content','wrong-content','wrong-service-id']){lookupMode=evidence;assert.equal((await service.status('admin-fixture',request.idempotencyKey,true)).data.attempt_status,'UNKNOWN');assert.equal(createCount,1);}
      assert.equal((await service.create('admin-fixture',request)).data.attempt_status,'UNKNOWN');assert.equal(createCount,1);
      lookupMode='success';assert.equal((await service.status('admin-fixture',request.idempotencyKey,true)).data.attempt_status,'SUCCESS');assert.equal(createCount,1);
    }
  });
  await reset();
  await check('print is actor-owned and SUCCESS-only; no dispatch for invalid scope/status/config/shop', async () => {
    const request = input({ orderId: 'order-one' });
    assert.equal((await service.create('manager-fixture', request)).data.attempt_status, 'SUCCESS');
    await reject(() => service.print('other-manager', request.idempotencyKey), 404);
    await reject(() => service.print('admin-fixture', request.idempotencyKey), 404, 'even admin cannot use another actor request key');
    await pool.query("update local_user_profiles set is_active=false where user_id='manager-fixture'");
    await reject(() => service.print('manager-fixture', request.idempotencyKey));
    await pool.query("update local_user_profiles set is_active=true where user_id='manager-fixture'");
    await pool.query("update local_orders set tenant_id='tenant-changed' where id='order-one'");
    await reject(() => service.print('manager-fixture', request.idempotencyKey), 409);
    await pool.query("update local_orders set tenant_id='tenant-one' where id='order-one'");
    for (const status of ['IN_FLIGHT', 'UNKNOWN', 'REMOTE_CREATED', 'REJECTED']) {
      await pool.query('update integration_private.ghn_order_attempts set status=$1 where idempotency_key=$2', [status, request.idempotencyKey]);
      await reject(() => service.print('manager-fixture', request.idempotencyKey), 409);
    }
    await pool.query("update integration_private.ghn_order_attempts set status='SUCCESS' where idempotency_key=$1", [request.idempotencyKey]);
    config.mode = 'DISABLED';
    try { await reject(() => service.print('manager-fixture', request.idempotencyKey), 503); }
    finally { config.mode = 'ENABLED'; }
    config.shops = ['123'];
    try { await reject(() => service.print('manager-fixture', request.idempotencyKey), 409); }
    finally { config.shops = ['123', '456']; }
    assert.equal(printCount, 0); assert.equal(createCount, 1);
  });
  await reset();
  await check('print uses stored code, fixed provider POST and safe output only; retry never creates shipment', async () => {
    const request = input();
    const createdResult = await service.create('admin-fixture', request);
    const before = (await pool.query('select status,order_code,result_data from integration_private.ghn_order_attempts')).rows[0];
    const result = await service.print('admin-fixture', request.idempotencyKey);
    assert.deepEqual(result, { success: true, data: { printUrl: 'https://online-gateway.ghn.vn/a5/public-api/printA5?token=synthetic-print-token-456' } });
    assert.deepEqual(lastPrint.body, { order_codes: [createdResult.data.order_code] });
    assert.equal(JSON.stringify(result).includes(config.token), false); assert.equal(JSON.stringify(result).includes('must-not-be-returned'), false);
    await service.print('admin-fixture', request.idempotencyKey);
    assert.equal(printCount, 2); assert.equal(createCount, 1);
    assert.deepEqual((await pool.query('select status,order_code,result_data from integration_private.ghn_order_attempts')).rows[0], before, 'printing must not mutate attempt lifecycle');
    assert.equal((await pool.query('select count(*)::int n from local_auth_audit_events')).rows[0].n, 1, 'print creates no shipment audit duplicate');
  });
  await reset();
  await check('print failures are bounded and sanitized, preserve SUCCESS/code, then recover by retry only', async () => {
    const request = input(), createdResult = await service.create('admin-fixture', request);
    for (const mode of ['http400', 'http500', 'network', 'abort', 'malformed', 'empty', 'url-token', 'short-token', 'large-token', 'oversize']) {
      printMode = mode;
      await assert.rejects(() => service.print('admin-fixture', request.idempotencyKey), error => {
        assert.equal(error.status, 502, mode); assert.equal(error.message.includes(config.token), false); assert.equal(error.message.includes('private'), false);
        assert.match(error.message, /Vận đơn đã được lưu/); return true;
      });
      const row = (await pool.query('select status,order_code from integration_private.ghn_order_attempts')).rows[0];
      assert.deepEqual(row, { status: 'SUCCESS', order_code: createdResult.data.order_code }, mode);
      assert.equal(createCount, 1, mode);
    }
    assert.equal(printStreamCancelled, true, 'oversize stream cancelled instead of buffering forever');
    printMode = 'success'; assert.equal((await service.print('admin-fixture', request.idempotencyKey)).success, true);
    assert.equal(createCount, 1); assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n, 1);
  });
  await reset();
  await check('print HTTP route is no-store and ignores caller-supplied arbitrary codes/URLs', async () => {
    const request = input(); await service.create('admin-fixture', request);
    let routeActor = 'admin-fixture';
    const app = express(); app.use(express.json()); registerGhnOrders(app, service, () => routeActor);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      const response = await fetch(origin + '/api/ghn-orders/' + request.idempotencyKey + '/print', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_codes: ['NOT-OWNED-CODE'], printUrl: 'https://attacker.invalid/ignored' }) });
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual((await response.json()).data, { printUrl: 'https://online-gateway.ghn.vn/a5/public-api/printA5?token=synthetic-print-token-456' });
      assert.deepEqual(lastPrint.body, { order_codes: ['SYNTHETIC1'] });
      routeActor = 'other-manager';
      const rejected = await fetch(origin + '/api/ghn-orders/' + request.idempotencyKey + '/print', { method: 'POST' });
      assert.equal(rejected.status, 404); assert.equal(rejected.headers.get('cache-control'), 'no-store'); assert.equal(printCount, 1);
      assert.equal((await rejected.text()).includes(config.token), false);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });
  await reset();
  await check('strict bounds and mismatched destination reject before create', async () => {
    for (const patch of [{cod_amount:50000001},{insurance_value:5000001},{weight:50001},{length:201},{items:[]},{items:[{...input().orderData.items[0],quantity:1001}]},{to_district_id:9999},{to_ward_code:'missing-ward'}]) {
      const request=input(); request.orderData={...request.orderData,...patch};
      await reject(()=>service.create('admin-fixture',request));
    }
    assert.equal(createCount,0);
  });
  await reset();
  await check('local audit failure preserves remote code; concurrent recovery finalizes once', async () => {
    await pool.query(`create function fixture_reject_audit() returns trigger language plpgsql as $$begin raise exception 'Synthetic audit failure'; end$$;
      create trigger fixture_reject_audit before insert on local_auth_audit_events for each row execute function fixture_reject_audit()`);
    const request=input(), first=await service.create('admin-fixture',request);
    assert.equal(first.data.attempt_status,'REMOTE_CREATED'); assert.match(first.data.order_code,/^SYNTHETIC/); assert.equal(createCount,1);
    assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n,0,'audit failure rolls tracking back');
    assert.equal((await pool.query('select status from integration_private.ghn_order_attempts')).rows[0].status,'REMOTE_CREATED');
    await pool.query('drop trigger fixture_reject_audit on local_auth_audit_events; drop function fixture_reject_audit()');
    const recovered=await Promise.all([service.status('admin-fixture',request.idempotencyKey),service.status('admin-fixture',request.idempotencyKey),service.create('admin-fixture',request)]);
    assert.ok(recovered.every(result=>result.data.attempt_status==='SUCCESS'));
    assert.equal(createCount,1); assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n,1);
    assert.equal((await pool.query('select count(*)::int n from local_auth_audit_events')).rows[0].n,1);
  });
  await reset();
  await check('finalize scope locks serialize concurrent ownership reassignment', async () => {
    let releaseInsert, enteredInsert;
    const barrier=new Promise(resolve=>{releaseInsert=resolve;});
    const reached=new Promise(resolve=>{enteredInsert=resolve;});
    const wrappedPool={query:pool.query.bind(pool),connect:async()=>{
      const client=await pool.connect();
      return {release:()=>client.release(),query:async(...args)=>{
        if(typeof args[0]==='string' && args[0].includes('insert into local_ghn_tracking')) {enteredInsert();await barrier;}
        return client.query(...args);
      }};
    }};
    const lockedService=new GhnOrders(wrappedPool,new ExternalReadAdapters({},provider,async()=>structuredClone(config)),provider);
    const updater=await pool.connect();
    let updating,creation;
    try {
      creation=lockedService.create('manager-fixture',input({orderId:'order-one'}));
      await reached;
      const updaterPid=(await updater.query('select pg_backend_pid() pid')).rows[0].pid;
      updating=updater.query("update local_orders set manager_id='other-manager',tenant_id='tenant-two' where id='order-one'");
      let blocked=false;
      for(let attempt=0;attempt<50;attempt++) {
        const row=(await pool.query('select cardinality(pg_blocking_pids($1))>0 blocked',[updaterPid])).rows[0];
        if(row.blocked){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.equal(blocked,true,'ownership update waits until authorized tracking/audit transaction commits');
      releaseInsert();
      assert.equal((await creation).data.attempt_status,'SUCCESS'); await updating;
      assert.deepEqual((await pool.query('select manager_id,tenant_id from local_ghn_tracking')).rows[0],{manager_id:'manager-fixture',tenant_id:'tenant-one'});
      assert.equal((await pool.query('select count(*)::int n from local_auth_audit_events')).rows[0].n,1);assert.equal(createCount,1);
    } finally {
      releaseInsert(); await creation?.catch(()=>undefined); await updating?.catch(()=>undefined); updater.release();
      await pool.query("update local_orders set manager_id='manager-fixture',tenant_id='tenant-one' where id='order-one'");
    }
  });
  await reset();
  await check('concurrent ambiguous dispatch reserves one create and blocks new request', async () => {
    createMode = 'timeout'; const request = input();
    gate = new Promise(resolve => { dispatched = resolve; });
    const begun = new Promise(resolve => { entered = resolve; });
    const first = service.create('admin-fixture', request); await begun;
    const duplicate = await service.create('admin-fixture', request); assert.equal(duplicate.data.attempt_status, 'IN_FLIGHT');
    await reject(() => service.create('admin-fixture', input()), 409);
    dispatched(); const result = await first;
    assert.equal(result.data.attempt_status, 'UNKNOWN'); assert.equal(createCount, 1);
    await service.create('admin-fixture', request); await service.status('admin-fixture', request.idempotencyKey); assert.equal(createCount, 1);
    for (const mode of ['missing', 'wrong-reference', 'wrong-shop', 'wrong-recipient']) {
      lookupMode = mode;
      assert.equal((await service.status('admin-fixture', request.idempotencyKey, true)).data.attempt_status, 'UNKNOWN', mode);
    }
    assert.equal(createCount, 1); assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n, 0);
    lookupMode = 'success';
    assert.equal((await service.status('admin-fixture', request.idempotencyKey, true)).data.attempt_status, 'SUCCESS');
    assert.equal(createCount, 1); assert.equal(lookupCount, 5);
    assert.equal((await pool.query('select count(*)::int n from local_auth_audit_events')).rows[0].n, 1);
  });
  await reset();
  await check('reconcile requires exact positive failed-delivery COD, historical missing only for zero', async () => {
    for (const amount of [0, 12000]) {
      await reset();createMode='timeout';const request=input();request.orderData.cod_failed_amount=amount;
      assert.equal((await service.create('admin-fixture',request)).data.attempt_status,'UNKNOWN');
      for (const mode of ['wrong-failed-cod','null-failed-cod',...(amount?['missing-failed-cod']:[])]) {
        lookupMode=mode;assert.equal((await service.status('admin-fixture',request.idempotencyKey,true)).data.attempt_status,'UNKNOWN',mode);
        assert.equal(createCount,1);assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n,0);
      }
      lookupMode=amount?'success':'missing-failed-cod';
      assert.equal((await service.status('admin-fixture',request.idempotencyKey,true)).data.attempt_status,'SUCCESS');assert.equal(createCount,1);
    }
  });
  await reset();
  await check('structured provider HTTP 400 is a definitive rejection', async () => {
    createMode = 'rejected';
    assert.equal((await service.create('admin-fixture', input())).data.attempt_status, 'REJECTED');
    assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n, 0);
  });
  await reset();
  await check('pre-dispatch configuration change never sends create', async () => {
    changeConfigBeforeDispatch = true;
    try { await service.create('admin-fixture', input()); } catch (error) { assert.equal(error.status, 409); }
    assert.equal(createCount, 0);
    assert.equal((await pool.query("select count(*)::int n from integration_private.ghn_order_attempts where status in ('UNKNOWN','IN_FLIGHT','REMOTE_CREATED')")).rows[0].n, 0);
  });
  await reset();
  await check('recovery remains available after linked order eligibility changes', async () => {
    createMode = 'timeout'; const request = input({ orderId: 'order-one' });
    assert.equal((await service.create('manager-fixture', request)).data.attempt_status, 'UNKNOWN');
    await pool.query("update local_orders set status='cancelled' where id='order-one'");
    const orderBeforeRecovery=(await pool.query("select * from local_orders where id='order-one'")).rows[0];
    assert.equal((await service.status('manager-fixture', request.idempotencyKey)).data.attempt_status, 'UNKNOWN');
    lookupMode = 'success';
    assert.equal((await service.status('manager-fixture', request.idempotencyKey, true)).data.attempt_status, 'SUCCESS', 'recovered upstream shipment must finalize even when new creation is no longer eligible');
    assert.equal(createCount, 1);
    assert.equal((await pool.query("select manager_id,tenant_id from local_ghn_tracking")).rows[0].tenant_id, 'tenant-one');
    assert.equal((await pool.query('select count(*)::int n from local_ghn_tracking')).rows[0].n,1);
    assert.equal((await pool.query('select count(*)::int n from local_auth_audit_events')).rows[0].n,1);
    assert.deepEqual((await pool.query("select * from local_orders where id='order-one'")).rows[0],orderBeforeRecovery,'recovery must not mutate CRM order');
    await reject(() => service.status('other-manager', request.idempotencyKey), 404);
    await pool.query("update local_orders set tenant_id='tenant-changed' where id='order-one'");
    await reject(() => service.status('manager-fixture', request.idempotencyKey), 409);
    await pool.query("update local_orders set tenant_id='tenant-one' where id='order-one'");
    await pool.query("update local_orders set status='confirmed' where id='order-one'");
    await pool.query("update local_user_profiles set is_active=false where user_id='manager-fixture'");
    await reject(() => service.status('manager-fixture', request.idempotencyKey));
    await pool.query("update local_user_profiles set is_active=true where user_id='manager-fixture'");
  });
  console.log('GHN_INDEPENDENT_PASS ' + JSON.stringify({ checks, providerNetwork: 'injected synthetic transport only' }));
} finally {
  if (pool) await pool.end();
  if (started) docker(['rm', '--force', container]);
  console.log('GHN_INDEPENDENT_CLEANUP disposable fixture container removed; no operational database used.');
}
