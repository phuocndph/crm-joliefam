import assert from 'node:assert/strict';
import {buildWorkerDayAttendance,workerDayAction} from '../src/lib/attendance-workspace.ts';
const workDate='2026-09-15',worker={id:'qa-worker',display_name:'Corrective QA',employee_code:'QA',is_active:true};
const base={workers:[worker],attendanceMethods:[],attendanceRows:[],productionEntries:[],overtimeRows:[],dayStatuses:[],closures:[],workDate};
const source={id:'qa-source',worker_id:worker.id,work_date:workDate,workflow_status:'REJECTED',is_reversed:false,created_at:workDate};
let failures=0,passed=0;
for(const [name,field,rejected] of [['attendance','attendanceRows',{...source,attendance_method:'DAY',day_units:1}],['production','productionEntries',{...source,quantity:3}],['overtime','overtimeRows',{...source,status:'REJECTED',overtime_minutes:60}]]) {
  try {
    const change={[field]:[rejected]},row=buildWorkerDayAttendance({...base,...change})[0];assert.equal(row.hasRejected,true);assert.equal(row.needsCorrection,true);assert.equal(workerDayAction(row).label,'Cần sửa');
    const resolved=buildWorkerDayAttendance({...base,...change,dayStatuses:[{worker_id:worker.id,work_date:workDate,status:'OFF'}]})[0];assert.equal(resolved.needsCorrection,false);assert.notEqual(workerDayAction(resolved).label,'Cần sửa');
    for(const status of ['APPROVED','SUBMITTED']) {
      const replacement={...rejected,id:'replacement',workflow_status:status,status};
      const current=buildWorkerDayAttendance({...base,[field]:[rejected,replacement]})[0];assert.equal(current.needsCorrection,false);assert.equal(current.hasPending,status==='SUBMITTED');
      const reversedReplacement=name==='overtime'?{...replacement,status:'REVERSED'}:{...replacement,is_reversed:true};
      const reversed=buildWorkerDayAttendance({...base,[field]:[rejected,reversedReplacement]})[0];assert.equal(reversed.needsCorrection,true,'reversed replacement cannot resolve rejected fact');
    }
    const stale=buildWorkerDayAttendance({...base,...change,closures:[{worker_id:worker.id,work_date:workDate,status:'EMPLOYEE_CONFIRMED',confirmed_revision:'1',current_revision:'2'}]})[0];assert.equal(workerDayAction(stale).label,'Cần sửa','correction must precede stale confirmation');
    const sealed=buildWorkerDayAttendance({...base,...change,closures:[{worker_id:worker.id,work_date:workDate,status:'LEADER_CONFIRMED',confirmed_revision:'1',current_revision:'1'}]})[0];assert.equal(workerDayAction(sealed).label,'Đã chốt','sealed history remains sealed');
    passed++;console.log('PASS '+name+': rejected-only/daystatus/replacements/reversal/stale/sealed');
  }
  catch(error){failures++;console.log('FAIL rejected-only '+name+': '+error.message);}
}
const replacement=buildWorkerDayAttendance({...base,attendanceRows:[{...source,attendance_method:'DAY',day_units:1},{...source,id:'replacement',workflow_status:'APPROVED',attendance_method:'DAY',day_units:1}],closures:[{worker_id:worker.id,work_date:workDate,status:'EMPLOYEE_CONFIRMED',confirmed_revision:'2',current_revision:'2'}]})[0];
assert.equal(workerDayAction(replacement).label,'Có thể chốt','historical rejection must not permanently block a valid replacement');
console.log('PASS historical rejection with approved replacement is not a permanent blocker');
console.log(JSON.stringify({passed:passed+1,failed:failures}));
if(failures)process.exitCode=1;
