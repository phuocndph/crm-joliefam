// Exercises production exports. Does not imitate component code or browser interactions.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

async function helper(file){const result=await build({entryPoints:[fileURLToPath(new URL(file,import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
const {overtimeRetryKey,overtimeRetryFingerprint}=await helper('../src/lib/attendance-retry.ts');
const {payrollWorkerMasterIssue}=await helper('../src/lib/payroll-worker-validation.ts');
const {attendanceDayMatchesFilters,attendanceDayInQueue,attendanceBulkScopeSignature}=await helper('../src/lib/attendance-workspace.ts');
const checks=[];
const check=(name,action)=>{action();checks.push(name);console.log('PASS '+name);};
const payload={worker_id:'worker-a',work_date:'2026-09-15',overtime_type:'NORMAL_OVERTIME',overtime_minutes:60,reason:'Fix urgent batch'};
check('OT identity normalizes whitespace while retaining a pending key across retries and field switches',()=>{
  const keys=new Map();let sequence=0;const create=()=>String(++sequence),first=overtimeRetryKey(keys,payload,create);
  assert.equal(overtimeRetryKey(keys,{...payload,reason:'  '+payload.reason+'  '},create).key,first.key);assert.equal(sequence,1);
  for(const altered of [{worker_id:'worker-b'},{work_date:'2026-09-16'},{overtime_type:'SUNDAY_OVERTIME'},{overtime_minutes:61},{reason:'Different reason'}])assert.notEqual(overtimeRetryKey(keys,{...payload,...altered},create).key,first.key);
  assert.equal(overtimeRetryKey(keys,payload,create).key,first.key);keys.delete(first.fingerprint);assert.notEqual(overtimeRetryKey(keys,payload,create).key,first.key);assert.equal(overtimeRetryFingerprint({...payload,overtime_minutes:'60'}),overtimeRetryFingerprint(payload));
});
check('both employee master forms share real-date relationship status and termination checks',()=>{
  const valid={employment_start_date:'2024-02-29',employment_end_date:'2026-01-10',payroll_status:'TERMINATED'};assert.equal(payrollWorkerMasterIssue(valid),null);assert.equal(payrollWorkerMasterIssue({employment_start_date:'',employment_end_date:'',payroll_status:'ACTIVE'}),null);
  for(const altered of [{employment_start_date:'2026-02-29'},{employment_end_date:'2026-04-31'},{employment_start_date:'2026-01-11'},{employment_end_date:''},{payroll_status:'INVALID'}])assert.ok(payrollWorkerMasterIssue({...valid,...altered}),JSON.stringify(altered));
});
const row={attendanceMethod:'DAY',activeEntries:[{attendance_method:'DAY'}],activeProductionEntries:[],hasPending:true,hasRejected:false,isRecorded:true,dayStatus:null,closureStatus:'OPEN',needsCorrection:false};
check('queue shares day filters across configured and actual methods plus pending rejected missing closed states',()=>{
  assert.equal(attendanceDayMatchesFilters(row,'DAY','PENDING'),true);assert.equal(attendanceDayMatchesFilters(row,'HOUR','PENDING'),false);assert.equal(attendanceDayMatchesFilters(row,'DAY','REJECTED'),false);
  const mixed={...row,activeProductionEntries:[{id:'output-source'}]};assert.equal(attendanceDayInQueue(mixed,'2026-09-15','2026-09-15','OUTPUT','PENDING'),true);assert.equal(attendanceDayInQueue(row,'2026-09-15','2026-09-15','OUTPUT','PENDING'),false);
  const rejected={...row,isRecorded:false,hasPending:false,hasRejected:true,needsCorrection:true,activeEntries:[]};assert.equal(attendanceDayInQueue(rejected,'2026-09-15','2026-09-15','DAY','REJECTED'),true);assert.equal(attendanceDayInQueue(rejected,'2026-09-15','2026-09-15','DAY','PENDING'),false);
  assert.equal(attendanceDayInQueue({...row,closureStatus:'LEADER_CONFIRMED'},'2026-09-15','2026-09-15','ALL','ALL'),false);assert.equal(attendanceDayInQueue(row,'2026-09-16','2026-09-15','ALL','ALL'),false);assert.equal(attendanceDayInQueue({...row,isRecorded:false,needsCorrection:false},'2026-09-15','2026-09-15','ALL','ALL'),false);
});
check('bulk scope identity is stable for reordered worker IDs and invalidates every changed scope control',()=>{
  const original=attendanceBulkScopeSignature('2026-09','team-a','An',['b','a']);assert.equal(original,attendanceBulkScopeSignature('2026-09','team-a','An',['a','b']));
  for(const input of [['2026-10','team-a','An',['a','b']],['2026-09','team-b','An',['a','b']],['2026-09','team-a','Binh',['a','b']],['2026-09','team-a','An',['a']],['2026-09','team-a','An',['a','b','c']]])assert.notEqual(original,attendanceBulkScopeSignature(...input));
});
console.log(JSON.stringify({suite:'readiness-runtime-helpers',passed:checks.length}));
