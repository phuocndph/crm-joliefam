const ruleLimit=64*1024;

// Return the original JSON text so the server can validate its raw byte size too.
// A blank optional rule deliberately overrides a saved rule in a debug request.
export function localAiRule(value:string,label:string):string {
  const bytes=(text:string)=>new TextEncoder().encode(text).byteLength;
  const oversized=()=>new Error(`${label}: vượt giới hạn 64 KB (65.536 byte UTF-8) mỗi mục.`);
  if(bytes(value)>ruleLimit)throw oversized();
  if(!value.trim())return value;
  let parsed:unknown;
  try{parsed=JSON.parse(value);}catch{throw new Error(`${label}: JSON không hợp lệ. Vui lòng kiểm tra cú pháp.`);}
  if(bytes(JSON.stringify(parsed))>ruleLimit)throw oversized();
  return value;
}
