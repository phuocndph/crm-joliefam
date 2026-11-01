/** Bounded JSON for carrier responses; caller decides whether failure is uncertain. */
export async function readGhnProviderJson(response: Response, limit = 1_000_000): Promise<Record<string, unknown>> {
 const reader=response.body?.getReader();
 if(!reader)throw new Error('Empty carrier response');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('Carrier response too large');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
 const value=JSON.parse(new TextDecoder().decode(data));
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid carrier response');
 return value;
}
