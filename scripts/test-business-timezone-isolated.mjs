// Synthetic connection strings and an owned disposable PostgreSQL database only.
// Run after build:server. Never loads .env or imports runtime/bootstrap config.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { BUSINESS_TIMEZONE, businessTimezoneConnectionOptions } from '../server-dist/db/business-timezone.js';

const suffix=process.pid+'_'+Date.now(),database='business_timezone_qa_'+suffix,role='business_timezone_role_'+suffix;
const secret=randomBytes(24).toString('hex');
const connectionString=`postgres://${role}:${secret}@127.0.0.1:55432/${database}`;
const control=sql=>{const r=spawnSync('docker',['exec','crm-joliefam-local-postgres','psql','-U','crm_local','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Disposable SQL control failed: '+r.stderr);return r.stdout;};
const pure=()=>{
  const input='postgres://fixture:synthetic-password@127.0.0.1:55432/fixture?application_name=keep_url_app&sslmode=disable';
  const plain=businessTimezoneConnectionOptions(input);
  assert.equal(BUSINESS_TIMEZONE,'Asia/Ho_Chi_Minh');assert.equal(new URL(plain.connectionString).searchParams.get('application_name'),'keep_url_app');assert.equal(new URL(plain.connectionString).searchParams.get('sslmode'),'disable');assert.match(plain.options,/-c timezone=Asia\/Ho_Chi_Minh$/);assert.equal(new URL(plain.connectionString).searchParams.get('options'),plain.options);
  const inputUrl=new URL(input);inputUrl.searchParams.set('timezone','UTC');inputUrl.searchParams.append('options','-c timezone=Europe/London');inputUrl.searchParams.append('options','-c application_name=keep_options_app -c search_path=public -c timezone=UTC');
  const configured=businessTimezoneConnectionOptions(inputUrl.toString(),'-c application_name=ignored_env -c timezone=UTC');
  assert.equal(new URL(configured.connectionString).searchParams.getAll('options').length,1);assert.match(configured.options,/^-c application_name=keep_options_app -c search_path=public -c timezone=UTC /);assert.match(configured.options,/-c timezone=Asia\/Ho_Chi_Minh$/);assert.ok(!configured.options.includes('ignored_env'));assert.equal(new URL(configured.connectionString).searchParams.get('timezone'),'UTC');
  const fromEnvironment=businessTimezoneConnectionOptions(input,'-c application_name=keep_env_app -c search_path=public -c timezone=UTC');assert.match(fromEnvironment.options,/^-c application_name=keep_env_app -c search_path=public -c timezone=UTC /);assert.match(fromEnvironment.options,/-c timezone=Asia\/Ho_Chi_Minh$/);
  assert.equal(inputUrl.searchParams.getAll('options').length,2,'Caller URL was not mutated');
  console.log('PASS synthetic URLs preserve ordinary parameters and final business timezone overrides URL/environment options');
};
pure();
let created=false;
try{
  control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${secret}'`);control(`alter role ${role} set timezone='UTC'`);control(`create database ${database} owner ${role}`);created=true;
  for(const scenario of [
    {label:'no URL options and UTC role default',url:connectionString,environment:''},
    {label:'environment options with explicit UTC',url:connectionString,environment:'-c application_name=qa_env_app -c search_path=public -c timezone=UTC',app:'qa_env_app'},
    {label:'URL options override environment and URL timezone UTC',url:(()=>{const u=new URL(connectionString);u.searchParams.set('timezone','UTC');u.searchParams.set('options','-c application_name=qa_url_app -c search_path=public -c timezone=UTC');return u.toString();})(),environment:'-c application_name=must_not_win -c timezone=UTC',app:'qa_url_app'},
  ]){
    const pool=new pg.Pool({...businessTimezoneConnectionOptions(scenario.url,scenario.environment),max:2});
    try{
      const clients=await Promise.all([pool.connect(),pool.connect()]);
      try{for(const client of clients){const r=(await client.query("select current_database() db,current_setting('TimeZone') zone,current_date::text today,(now() at time zone 'Asia/Ho_Chi_Minh')::date::text expected,current_setting('application_name') app,current_setting('search_path') search_path,('2026-10-16 18:00:00+00'::timestamptz)::date::text midnight_boundary,(select rolsuper from pg_roles where rolname=current_user) superuser")).rows[0];assert.equal(r.db,database);assert.equal(r.zone,BUSINESS_TIMEZONE);assert.equal(r.today,r.expected);assert.equal(r.midnight_boundary,'2026-10-17');assert.equal(r.superuser,false);if(scenario.app){assert.equal(r.app,scenario.app);assert.equal(r.search_path,'public');}}}finally{clients.forEach(c=>c.release());}
      console.log('PASS real PostgreSQL two pooled connections: '+scenario.label);
    }finally{await pool.end();}
  }
  console.log('PASS business timezone independent verification (4 groups)');
}finally{if(created)control(`drop database ${database} with (force)`);control(`drop role if exists ${role}`);console.log('CLEANUP own timezone database and role removed');}
