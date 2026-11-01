import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {payrollV3OvertimeRate} from '../server/payroll-rules.ts';
import {resolvePayrollOvertimeRate} from '../server/payroll-snapshot.ts';

type Rate={id:string;attendance_method:string;compensation_type:string;amount_numeric:string;unit_rate:string;status:string;effective_from:string;effective_to:string|null};
const rate=(id:string,method='DAY',type='MONTHLY_HELPER',amount='10000000',extra:Partial<Rate>={}):Rate=>({id,attendance_method:method,compensation_type:type,amount_numeric:amount,unit_rate:method==='DAY'?'48076.923076923076923077':amount,status:'APPROVED',effective_from:'2026-09-01',effective_to:'2026-09-30',...extra});
// The adapter models only existing approved/date/method SQL and supplies fixed numeric
// query responses. It does not choose by compensation basis: the real modules must.
function adapter(fixtures:Rate[]){return {async query(sql:string,args:unknown[]=[]){
 if(sql.includes('from local_worker_rates')){
  assert.ok(sql.includes("status='APPROVED'"));assert.equal(args[0],'worker');const date=String(args[1]),type=String(args[2]);assert.ok(sql.includes('effective_from'));assert.ok(sql.includes('effective_to'));
  const rows=fixtures.filter(r=>r.status==='APPROVED'&&r.effective_from<=date&&(!r.effective_to||r.effective_to>=date)&&(r.attendance_method==='HOUR'||r.attendance_method==='DAY'&&['MONTHLY_MANAGER','MONTHLY_HELPER'].includes(type)));
  if(sql.includes('select r.id'))return {rows:rows.map(r=>({id:r.id,attendance_method:r.attendance_method,unit_rate:r.unit_rate,base_rate_amount:r.amount_numeric,standard_days_per_month:'26',standard_hours_per_day:'8',...(sql.includes('r.compensation_type')?{compensation_type:r.compensation_type}:{})}))};
  return {rows};
 }
 assert.ok(sql.includes('select case when'));assert.deepEqual(args.slice(2),['26','480']);const values:Record<string,string>={'DAY|10000000':'48076.923076923076923077','DAY|0':'0','DAY|-1':'-0.00480769230769230769','HOUR|45000':'45000','HOUR|50000':'50000','HOUR|0':'0','HOUR|-1':'-1'};const value=values[String(args[0])+'|'+String(args[1])];assert.notEqual(value,undefined);return {rows:[{unit_rate:value}]};
 }};}
const cases:Array<{name:string;type:string;rates:Rate[];expected:string|null;date?:string;unit?:string}>=[
 {name:'monthly helper rejects competing unrelated hourly default',type:'MONTHLY_HELPER',rates:[rate('day'),rate('wrong-hour','HOUR','HOURLY','45000')],expected:'day'},
 {name:'monthly same-type HOUR cannot shadow matching DAY',type:'MONTHLY_HELPER',rates:[rate('day'),rate('same-type-hour','HOUR','MONTHLY_HELPER','45000')],expected:'day'},
 {name:'monthly same-type HOUR alone cannot replace DAY',type:'MONTHLY_HELPER',rates:[rate('same-type-hour','HOUR','MONTHLY_HELPER','45000')],expected:null},
 {name:'monthly manager uses matching DAY type only',type:'MONTHLY_MANAGER',rates:[rate('manager','DAY','MONTHLY_MANAGER'),rate('other-monthly'),rate('wrong-hour','HOUR','HOURLY','45000')],expected:'manager'},
 {name:'monthly cannot fall back to HOUR when DAY missing',type:'MONTHLY_HELPER',rates:[rate('wrong-hour','HOUR','HOURLY','45000')],expected:null},
 {name:'monthly cannot use DAY belonging to another monthly type',type:'MONTHLY_HELPER',rates:[rate('wrong-day','DAY','MONTHLY_MANAGER')],expected:null},
 {name:'duplicate matching monthly rates block',type:'MONTHLY_HELPER',rates:[rate('first'),rate('second')],expected:null},
 {name:'wrong type duplicates cannot shadow a valid monthly rate',type:'MONTHLY_HELPER',rates:[rate('day'),rate('wrong1','HOUR','HOURLY','45000'),rate('wrong2','HOUR','HOURLY','45000')],expected:'day'},
 {name:'effective lower date is inclusive and drafts ignored',type:'MONTHLY_HELPER',rates:[rate('day'),rate('draft','DAY','MONTHLY_HELPER','10000000',{status:'DRAFT'})],date:'2026-09-01',expected:'day'},
 {name:'effective upper date is inclusive',type:'MONTHLY_HELPER',rates:[rate('day')],date:'2026-09-30',expected:'day'},
 {name:'expired monthly rate cannot use unrelated effective HOUR',type:'MONTHLY_HELPER',rates:[rate('expired','DAY','MONTHLY_HELPER','10000000',{effective_to:'2026-09-14'}),rate('hour','HOUR','HOURLY','45000')],expected:null},
 {name:'future monthly rate is excluded',type:'MONTHLY_HELPER',rates:[rate('future','DAY','MONTHLY_HELPER','10000000',{effective_from:'2026-09-16'})],expected:null},
 {name:'HOURLY uses only HOURLY HOUR rate',type:'HOURLY',rates:[rate('hour','HOUR','HOURLY','50000'),rate('wrong','HOUR','PIECE_RATE','45000')],expected:'hour',unit:'50000'},
 {name:'HOURLY cannot use another compensation type',type:'HOURLY',rates:[rate('wrong','HOUR','PIECE_RATE','45000')],expected:null},
 {name:'duplicate HOURLY rates block',type:'HOURLY',rates:[rate('first','HOUR','HOURLY','50000'),rate('second','HOUR','HOURLY','50000')],expected:null},
 {name:'PIECE_RATE existing HOUR basis remains unchanged',type:'PIECE_RATE',rates:[rate('hour','HOUR','HOURLY','45000')],expected:'hour',unit:'45000'},
 {name:'other existing HOUR path remains unchanged',type:'LEGACY_OTHER',rates:[rate('hour','HOUR','MONTHLY_MANAGER','45000')],expected:'hour',unit:'45000'},
 {name:'zero hourly basis blocks',type:'HOURLY',rates:[rate('zero','HOUR','HOURLY','0')],expected:null},
 {name:'negative hourly basis blocks',type:'HOURLY',rates:[rate('negative','HOUR','HOURLY','-1')],expected:null},
 {name:'zero monthly DAY basis blocks',type:'MONTHLY_HELPER',rates:[rate('zero','DAY','MONTHLY_HELPER','0',{unit_rate:'0'})],expected:null},
 {name:'negative monthly DAY basis blocks',type:'MONTHLY_HELPER',rates:[rate('negative','DAY','MONTHLY_HELPER','-1',{unit_rate:'-0.00480769230769230769'})],expected:null},
];
const results=[];
for(const c of cases){try{
 const date=c.date||'2026-09-15',db=adapter(c.rates),context={worker:{id:'worker'},assignment:{compensation_type:c.type}},calendar={days_numeric:'26',minutes_numeric:'480'};
 if(c.expected===null){await assert.rejects(()=>payrollV3OvertimeRate(db as never,context,date,calendar));assert.equal(await resolvePayrollOvertimeRate(db as never,'worker',date,c.type),null);}
 else{const current=await payrollV3OvertimeRate(db as never,context,date,calendar),legacy=await resolvePayrollOvertimeRate(db as never,'worker',date,c.type);assert.equal(current.rate_id,c.expected);assert.equal(legacy?.id,c.expected);assert.equal(current.unit_rate,c.unit||'48076.923076923076923077');assert.equal(legacy?.unit_rate,c.unit||'48076.923076923076923077');assert.deepEqual(Object.keys(current).sort(),['unit_rate','rate_id','base_rate_amount','attendance_method'].sort());assert.deepEqual(Object.keys(legacy!).sort(),['id','attendance_method','unit_rate','base_rate_amount','standard_days_per_month','standard_hours_per_day'].sort());}
 results.push({name:c.name,status:'PASS'});
 }catch{results.push({name:c.name,status:'FAIL'});}}
const report={kind:'ACTUAL_PAYROLL_MODULE_BASIS_REGRESSION_WITH_FIXED_QUERY_ADAPTER',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results,database_calls:0,source_writes:0};
const output=process.argv.find(v=>v.startsWith('--proof='))?.slice(8);if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(report.failed)process.exitCode=1;
