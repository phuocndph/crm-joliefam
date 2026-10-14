import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {scryptSync,randomBytes} from 'node:crypto';
const suffix=String(Date.now());
const db='isolated_vps_'+suffix, role='qa_vps_'+suffix;
const container='crm-joliefam-local-postgres';
const password='IsolatedFixture-'+randomBytes(16).toString('hex');
const run=(args)=>{const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Isolated PostgreSQL command failed: '+r.stderr);return r.stdout;};
const sql=(statement,database=db)=>run(['exec',container,'psql','-U','crm_local','-d',database,'-v','ON_ERROR_STOP=1','-At','-c',statement]);
const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(r=>server.close(r));
const base='http://127.0.0.1:'+port;
let child,created=false,logs='';
try{
 sql('CREATE ROLE '+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+password+"'",'postgres');
 sql('CREATE DATABASE '+db+' OWNER '+role,'postgres');created=true;
 child=spawn(process.execPath,['server-dist/index.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'production',PUBLIC_APP_URL:'https://crm.example.com',LOCAL_DATABASE_URL:'postgres://'+role+':'+password+'@127.0.0.1:55432/'+db,LOCAL_API_HOST:'0.0.0.0',LOCAL_API_PORT:String(port),LOCAL_SYNC_AUTO:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_DEMO_AUTH:'true'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
 let healthy=false;
 for(let i=0;i<160;i++){if(child.exitCode!==null)throw new Error('Production API failed to start: '+logs);try{const r=await fetch(base+'/health');const h=await r.json();if(h.ok&&h.database===db){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(healthy,'Isolated API health');
 assert.equal(sql('select count(*) from local_workers').trim(),'0','Production bootstrap must not seed demo workers');
 assert.equal(sql("select count(*) from local_schema_migrations where name='__seed.sql'").trim(),'0');
 const salt=randomBytes(16).toString('hex');const hash='scrypt$'+salt+'$'+scryptSync('FixturePassword!1',salt,64).toString('hex');
 sql("insert into local_user_profiles(id,user_id,email,password_hash,is_active) values('fixture','fixture','fixture@test.invalid','"+hash+"',true)");
 sql("insert into local_user_roles(user_id,role) values('fixture','employee')");
 sql("insert into local_user_profiles(id,user_id,email,password_hash,is_active) values('adminfixture','adminfixture','adminfixture@test.invalid','"+hash+"',true)");
 sql("insert into local_user_roles(user_id,role) values('adminfixture','admin')");
 const request=async(path,token,method='GET',body,origin='https://crm.example.com')=>{
  const r=await fetch(base+path,{method,headers:{origin,...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json().catch(()=>null)};
 };
 assert.equal((await request('/api/local-auth/session')).status,403);
 assert.equal((await request('/api/orders')).status,401);
 assert.equal((await request('/api/local-auth/login',null,'POST',{email:'fixture@test.invalid',password:'FixturePassword!1'},'https://crm.example.com.evil.test')).status,403);
 const login=await request('/api/local-auth/login',null,'POST',{email:'fixture@test.invalid',password:'FixturePassword!1'});assert.equal(login.status,200);const token=login.body.token;
 const adminLogin=await request('/api/local-auth/login',null,'POST',{email:'adminfixture@test.invalid',password:'FixturePassword!1'});assert.equal(adminLogin.status,200);
 assert.equal((await request('/api/orders',adminLogin.body.token)).status,200);
 assert.equal((await request('/api/local-table/quotes',adminLogin.body.token,'POST',{})).status,403,'Admin cannot create shadow canonical records');
 for (const table of ['fabric_transactions','shipping_companies','knowledge_documents','order_payments']) assert.equal((await request('/api/local-table/'+table,adminLogin.body.token,'POST',{})).status,403,'Admin canonical adapter '+table);
 assert.equal((await request('/api/local-auth/me',token)).body.user_id,'fixture');
 for(const path of ['/api/customers','/api/orders','/api/quotes','/api/contracts','/api/catalog/products','/api/expenses','/api/transactions','/api/fabrics/types','/api/local-snapshot/customers'])assert.equal((await request(path,token)).status,403,path);
 for(const path of ['/api/production-orders','/api/manufacturing/products','/api/manufacturing/products/fake/profile','/api/manufacturing/products/fake/bom','/api/manufacturing/products/fake/routing']) assert.equal((await request(path,token)).status,403,path);
 sql("insert into local_employee_permissions(user_id,permission_type,enabled) values('fixture','orders',true)");
 assert.equal((await request('/api/orders',token)).status,200);
 assert.equal((await request('/api/catalog/products',token)).status,200,'Order product lookup');
 assert.equal((await request('/api/local-rpc/get_order_stats',token,'POST',{})).status,200);
 assert.equal((await request('/api/local-snapshot/orders',token)).status,200);
 assert.equal((await request('/api/transactions',token)).status,403,'Order right does not grant transactions');
 assert.equal((await request('/api/catalog/products/fake',token,'DELETE')).status,403,'Lookup right does not grant deletion');
 assert.equal((await request('/api/customers/fake',token,'DELETE')).status,403);
 assert.equal((await request('/api/quotes/fake/approve',token,'POST',{})).status,403);
 assert.equal((await request('/api/local-snapshot/user_roles',token)).status,200,'Own role metadata');
 assert.equal((await request('/api/local-table/quotes',token,'POST',{})).status,403);
 assert.equal((await request('/api/local-functions/predictive-analytics',token,'POST',{})).status,403);
 for(const [right,paths] of [['reports',['/api/orders','/api/quotes','/api/expenses','/api/catalog/products']],['cash_flow',['/api/orders','/api/catalog/products']],['transactions',['/api/orders']],['production_view',['/api/production-orders','/api/manufacturing/products','/api/manufacturing/products/fake/profile']]]) {
  sql("delete from local_employee_permissions where user_id='fixture'");
  sql("insert into local_employee_permissions(user_id,permission_type,enabled) values('fixture','"+right+"',true)");
  for(const path of paths)assert.ok([200,404].includes((await request(path,token)).status),right+' read dependency '+path);
  assert.equal((await request('/api/catalog/products/fake',token,'DELETE')).status,403,right+' must not grant product deletion');
  assert.equal((await request('/api/customers/fake',token,'DELETE')).status,403,right+' must not grant customer deletion');
 }
 assert.equal((await request('/api/local-auth/logout',token,'POST')).status,200);
 assert.equal((await request('/api/orders',token)).status,401);
 assert.equal((await request('/api/local-auth/session')).status,403);
 assert.ok(!logs.includes(password),'Database secret leaked to API logs');
 console.log('Isolated production API passed: compiled runtime, unprivileged DB role, no demo seed/bootstrap, login, exact origins, module grants/denials and revocation.');
}finally{
 if(child&&child.exitCode===null){child.kill();await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,5000))]);}
 if(created)sql('DROP DATABASE '+db+' WITH (FORCE)','postgres');
 sql('DROP ROLE IF EXISTS '+role,'postgres');
}

