import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';

// Intentionally never reads .env or contacts Supabase. Values come from caller environment.
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.dirname(root);
const eligible = "p.is_active and p.user_id<>'local-admin' and nullif(p.password_hash,'') is null and (p.is_snapshot_record or nullif(p.source_snapshot_key,'') is not null)";
// Quoting alone does not prevent spreadsheet formula execution for synchronized names/emails.
const quoteCsv = value => {
 const text=String(value ?? '');
 const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? "'"+text : text;
 return '"'+safe.replace(/"/g,'""')+'"';
};
const inside = (candidate, parent) => {const relative=path.relative(parent,candidate);return !relative || (!relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative));};
const powershell = async source => exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{windowsHide:true});

async function createPrivateFile(output) {
 if (!path.isAbsolute(output) || output.startsWith('\\\\') || output.startsWith('//')) throw new Error('OUTPUT_PATH_INVALID');
 const resolved = path.resolve(output);
 const parent = path.dirname(resolved);
 const actualParent = await fs.realpath(parent);
 const canonical=value=>process.platform==='win32'?value.toLowerCase():value;
 if (canonical(actualParent)!==canonical(parent)) throw new Error('OUTPUT_REPARSE_PATH');
 if (inside(resolved,await fs.realpath(workspace)) || inside(resolved,await fs.realpath(root))) throw new Error('OUTPUT_INSIDE_WORKSPACE');
 const storageRoot = path.resolve(process.env.LOCAL_STORAGE_ROOT || path.join(root,'.local-storage'));
 if (inside(resolved,storageRoot)) throw new Error('OUTPUT_PUBLIC_STORAGE');
 if (process.platform==='win32') {
  const drive=path.parse(resolved).root.slice(0,2);
  const driveCheck=await powershell(`([IO.DriveInfo]::new('${drive}\\')).DriveType.ToString()`);
  if(driveCheck.stdout.trim()!=='Fixed')throw new Error('OUTPUT_NOT_LOCAL_DISK');
 }
 const file = await fs.open(resolved,'wx',0o600);
 try {
  if (process.platform==='win32') {
   const sid=(await powershell('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value')).stdout.trim();
   if(!/^S-1-5-[0-9-]+$/.test(sid))throw new Error('OUTPUT_ACL_IDENTITY');
   await exec('icacls.exe',[resolved,'/inheritance:r','/grant:r',`*${sid}:(F)`],{windowsHide:true});
   const literal=resolved.replace(/'/g,"''");
   // Use framework ACL APIs: inherited pwsh PSModulePath can break Get-Acl autoload in Windows PowerShell.
   const acl=(await powershell(`$a=[IO.File]::GetAccessControl('${literal}'); $r=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])); if($a.AreAccessRulesProtected -and $r.Count -eq 1 -and $r[0].AccessControlType -eq 'Allow' -and $r[0].IdentityReference.Value -eq '${sid}'){'PRIVATE'}else{exit 1}`)).stdout.trim();
   if(acl!=='PRIVATE')throw new Error('OUTPUT_ACL_VERIFY');
  } else {
   await file.chmod(0o600);
   const stat=await file.stat();
   if((stat.mode&0o777)!==0o600 || (typeof process.getuid==='function' && stat.uid!==process.getuid()))throw new Error('OUTPUT_MODE_VERIFY');
  }
  return {file,output:resolved};
 }catch(error){await file.close();await fs.unlink(resolved).catch(()=>{});throw error;}
}

let pool, client, handoff, inTransaction=false, commitAttempted=false, committed=false;
try {
 const args=process.argv.slice(2);let apply=false,dryRun=false,output;
 for(let index=0;index<args.length;index++){
  if(args[index]==='--apply'){if(apply)throw new Error('ARGUMENT_DUPLICATE');apply=true;}
  else if(args[index]==='--dry-run'){if(dryRun)throw new Error('ARGUMENT_DUPLICATE');dryRun=true;}
  else if(args[index]==='--output'){if(output || !args[index+1] || args[index+1].startsWith('--'))throw new Error('OUTPUT_INVALID');output=args[++index];}
  else throw new Error('ARGUMENT_INVALID');
 }
 if(apply&&dryRun || !apply&&output)throw new Error('ARGUMENT_CONFLICT');
 if(apply&&!output)throw new Error('OUTPUT_REQUIRED');
 if(apply&&!process.env.LOCAL_DATABASE_URL)throw new Error('DATABASE_EXPLICIT_REQUIRED');
 const databaseUrl=process.env.LOCAL_DATABASE_URL || 'postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/crm_local';
 const database=new URL(databaseUrl);
 // pg accepts query-string overrides (including host): forbid them before connecting.
 if(database.search || database.hash || !['postgres:','postgresql:'].includes(database.protocol)||!['localhost','127.0.0.1','[::1]'].includes(database.hostname))throw new Error('DATABASE_NOT_LOOPBACK');
 pool=new Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:5000});
 client=await pool.connect();
 if(!apply){const count=(await client.query(`select count(*)::int count from local_user_profiles p where ${eligible}`)).rows[0].count;console.log(JSON.stringify({mode:'DRY_RUN',eligible_accounts:count,passwords_changed:0}));}
 else{
  await client.query('begin');inTransaction=true;
  await client.query("set local lock_timeout='5s'");
  await client.query("set local statement_timeout='10s'");
  const rows=(await client.query(`select p.user_id,p.email,p.first_name,p.last_name from local_user_profiles p where ${eligible} order by p.user_id for update`)).rows;
  if(!rows.length){await client.query('rollback');inTransaction=false;console.log(JSON.stringify({mode:'APPLY',eligible_accounts:0,passwords_changed:0,output_created:false}));}
  else{
   handoff=await createPrivateFile(output);
   const credentials=[];const used=new Set();
   for(const row of rows){
    let password;do{password='Aa1!'+randomBytes(32).toString('base64url');}while(used.has(password));used.add(password);
    const salt=randomBytes(16).toString('hex');const passwordHash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
    const updated=await client.query(`update local_user_profiles p set password_hash=$2,local_modified_at=now(),updated_at=now() where p.user_id=$1 and ${eligible} returning p.user_id`,[row.user_id,passwordHash]);
    if(updated.rowCount!==1)throw new Error('ACCOUNT_CHANGED');
    await client.query('delete from local_auth_sessions where user_id=$1',[row.user_id]);
    await client.query('insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason) values($1,$2,$3,$4,$5)',['USER_PASSWORD',row.user_id,'LOCAL_PASSWORD_INITIALIZED','local-offline-password-initializer','Khởi tạo mật khẩu local cho tài khoản đồng bộ chưa có mật khẩu; giữ nguyên hồ sơ và phân quyền']);
    credentials.push([row.user_id,row.email,[row.first_name,row.last_name].filter(Boolean).join(' '),password,'Mật khẩu mới chỉ dùng local; tự đổi ngay sau khi nhận. Không thay đổi tài khoản public.']);
   }
   const csv='\uFEFF'+[['Mã tài khoản','Email','Họ tên','Mật khẩu local mới','Hướng dẫn'],...credentials].map(row=>row.map(quoteCsv).join(',')).join('\r\n')+'\r\n';
   await handoff.file.writeFile(csv,{encoding:'utf8'});await handoff.file.sync();await handoff.file.close();handoff.file=null;
   commitAttempted=true;await client.query('commit');committed=true;inTransaction=false;
   console.log(JSON.stringify({mode:'APPLY',eligible_accounts:rows.length,passwords_changed:rows.length,output:handoff.output,output_created:true}));
  }
 }
}catch{
 if(inTransaction&&client)await client.query('rollback').catch(()=>{});
 if(handoff?.file)await handoff.file.close().catch(()=>{});
 if(handoff&&!committed&&!commitAttempted)await fs.unlink(handoff.output).catch(()=>{});
 // A COMMIT network error is ambiguous: retain the ONLY private handoff rather than lose credentials.
 if(commitAttempted&&!committed){console.error('Không xác định được kết quả COMMIT. Tệp bàn giao riêng được giữ lại; kiểm tra trạng thái SQL trước khi chạy lại.');process.exitCode=2;}
 else{console.error('Không thể khởi tạo mật khẩu local. Không ghi đè mật khẩu có sẵn. Kiểm tra tham số, SQL local và quyền tệp bàn giao.');process.exitCode=1;}
}finally{client?.release();await pool?.end();}
