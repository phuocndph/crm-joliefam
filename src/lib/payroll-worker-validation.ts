export function payrollWorkerMasterIssue(form: {employment_start_date:string;employment_end_date:string;payroll_status:string}):string|null {
  for(const [value,label] of [[form.employment_start_date,"Ngày vào làm"],[form.employment_end_date,"Ngày nghỉ việc"]]) {
    if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-") || !Number.isFinite(Date.parse(value+"T00:00:00Z")) || new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)) return `${label} không hợp lệ.`;
  }
  if(!["ACTIVE","SUSPENDED","TERMINATED"].includes(form.payroll_status))return "Trạng thái lương không hợp lệ.";
  if(form.employment_end_date && form.employment_start_date && form.employment_end_date<form.employment_start_date)return "Ngày nghỉ việc không được trước ngày vào làm.";
  if(form.payroll_status==='TERMINATED' && !form.employment_end_date)return "Nhân sự đã nghỉ việc cần có ngày nghỉ việc.";
  return null;
}
