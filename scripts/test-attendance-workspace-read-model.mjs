// Pure read-model regression; no database or browser access.
import assert from 'node:assert/strict';
import { buildWorkerDayAttendance,attendanceValueLabel,workerDayAction } from '../src/lib/attendance-workspace.ts';
const date='2026-09-15',worker={id:'worker',display_name:'Worker',employee_code:'W1',is_active:true};
const input={workers:[worker],attendanceMethods:[],attendanceRows:[],productionEntries:[],overtimeRows:[],dayStatuses:[],closures:[],workDate:date};
let row=buildWorkerDayAttendance(input)[0];assert.equal(row.isRecorded,false);assert.equal(attendanceValueLabel(row),'Chưa ghi nhận');assert.equal(workerDayAction(row).label,'Chưa ghi nhận');
const ot={id:'ot',worker_id:'worker',work_date:date,status:'SUBMITTED',overtime_minutes:60,created_at:date};
row=buildWorkerDayAttendance({...input,overtimeRows:[ot]})[0];assert.equal(row.isRecorded,true);assert.equal(row.hasPending,true);assert.equal(row.pendingRecordCount,1);assert.equal(row.pendingCounts.overtime,1);
row=buildWorkerDayAttendance({...input,workers:[{...worker,is_active:false}],overtimeRows:[ot]})[0];assert.ok(row,'inactive worker with OT month source remains');
assert.equal(buildWorkerDayAttendance({...input,workers:[{...worker,is_active:false}]}).length,0);
row=buildWorkerDayAttendance({...input,dayStatuses:[{worker_id:'worker',work_date:date,status:'OFF'}]})[0];assert.equal(row.isRecorded,true);assert.equal(row.hasPending,false);
const legacy={id:'legacy',worker_id:'worker',work_date:date,attendance_method:'OUTPUT',output_quantity:10,workflow_status:'APPROVED',is_reversed:false,calculated_amount:999,cost_visible:true,created_at:date};
const prod={id:'prod',worker_id:'worker',work_date:date,quantity:2,workflow_status:'APPROVED',calculated_amount:100,cost_visible:false,created_at:date};
row=buildWorkerDayAttendance({...input,attendanceRows:[legacy],productionEntries:[prod]})[0];assert.equal(row.totalOutput,2);assert.equal(row.legacyOutputQuantity,10);assert.equal(row.approvedAmount,0);assert.equal(row.legacyApprovedAmount,999);
row=buildWorkerDayAttendance({...input,overtimeRows:[{...ot,status:'APPROVED'}],closures:[{worker_id:'worker',work_date:date,status:'EMPLOYEE_CONFIRMED',confirmed_revision:null,current_revision:'2'}]})[0];assert.equal(workerDayAction(row).label,'Cần xác nhận lại');
row=buildWorkerDayAttendance({...input,attendanceRows:[{...legacy,workflow_status:'REJECTED'}],overtimeRows:[{...ot,status:'APPROVED'}],closures:[{worker_id:'worker',work_date:date,status:'EMPLOYEE_CONFIRMED',confirmed_revision:'2',current_revision:'2'}]})[0];assert.equal(workerDayAction(row).label,'Có thể chốt','historical rejection is not a permanent hard blocker');
console.log('PASS 8 read-model groups: neutral/OT/inactive/history/daystatus/legacy/privacy/stale');
