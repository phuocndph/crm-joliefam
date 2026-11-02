// TEST ONLY: actual address popup components; in-memory directories, no API/providers/database.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const entry=`import React,{useCallback,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '/src/index.css';
import {GhnNewReceiverAddressDialog} from '/src/components/GhnNewReceiverAddressDialog.tsx';
import {GhnReceiverAddressDialog} from '/src/components/GhnReceiverAddressDialog.tsx';
const stats={reads:[],commits:[],externalCalls:0};window.fixtureStats=stats;
const provinces=[{_id:79,name:'Thành phố Hồ Chí Minh',extension_names:['TP Hồ Chí Minh','TP.HCM']},{_id:1,name:'Thành phố Hà Nội',extension_names:['Hà Nội']}];
const wardRows={79:[{_id:7901,parent_id:79,name:'Phường An Phú Đông',extension_names:['An Phú Đông']},{_id:7902,parent_id:79,name:'Phường Bến Nghé',extension_names:['Bến Nghé']}],1:[{_id:101,parent_id:1,name:'Phường Ba Đình',extension_names:['Ba Đình']}]};
const oldProvinces=[{ProvinceID:79,ProvinceName:'Thành phố Hồ Chí Minh',NameExtension:['TP.HCM']}];
const query=new URLSearchParams(location.search);
function App(){const [mode,setMode]=useState(query.get('mode')==='OLD3'?'OLD3':'NEW2'),[open,setOpen]=useState(true),[delay,setDelay]=useState(query.has('race')),[result,setResult]=useState(null);
const read=useCallback(async(action,body={})=>{stats.reads.push({action,body});if(delay&&action==='get_new_wards'){if(query.has('race'))setTimeout(()=>setMode('OLD3'),200);await new Promise(r=>setTimeout(r,2000));}
if(action==='get_new_provinces')return provinces;if(action==='get_new_wards')return wardRows[body.provinceId]||[];
if(action==='address_autocomplete_status')return{configured:false};if(action==='get_districts')return[{DistrictID:1444,DistrictName:'Quận 1'}];if(action==='get_wards')return[{WardCode:'bn',WardName:'Phường Bến Nghé'}];throw Error('Unexpected fixture read: '+action);},[delay]);
const commit=value=>{stats.commits.push({mode,value});setResult({mode,value});setOpen(false);};
return <main><h1>GHN synthetic address test</h1><select id="fixture-mode" value={mode} onChange={e=>{setMode(e.target.value);setOpen(true);}}><option>NEW2</option><option>OLD3</option></select><button id="fixture-delay" onClick={()=>setDelay(v=>!v)}>Delay: {String(delay)}</button><button id="fixture-open" onClick={()=>setOpen(true)}>Open</button><pre id="fixture-result">{JSON.stringify(result)}</pre>{open&&(mode==='NEW2'?<GhnNewReceiverAddressDialog key="new" initial={{address:'',provinceId:'',wardId:'',provinceName:'',wardName:''}} read={read} onCancel={()=>setOpen(false)} onCommit={commit}/>:<GhnReceiverAddressDialog key="old" initial={{address:'',provinceId:'',districtId:'',wardCode:'',districts:[],wards:[]}} provinces={oldProvinces} read={read} onCancel={()=>setOpen(false)} onCommit={commit}/>)}</main>};createRoot(document.getElementById('root')).render(<App/>);`;
const server=await createServer({root:path.join(root,'scripts'),optimizeDeps:{noDiscovery:false,entries:[],include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']},configFile:false,envFile:false,plugins:[react(),{name:'synthetic-address-entry',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url.startsWith('/__fixture_error')){console.error(req.url);res.end('ok');return;}if(req.url==='/'||req.url.startsWith('/?')){res.setHeader('Content-Type','text/html');res.end('<html><head><script>window.addEventListener("error",e=>fetch("/__fixture_error?m="+encodeURIComponent(e.message)));window.addEventListener("unhandledrejection",e=>fetch("/__fixture_error?m="+encodeURIComponent(String(e.reason))));</script><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root">Loading synthetic popup…</div><script type="module" src="/@vite/client"></script><script type="module" src="/fixture-entry.tsx"></script></body></html>');return;}next();});},resolveId(id){if(id==='/fixture-entry.tsx')return '\0fixture-entry.tsx';},load(id){if(id==='\0fixture-entry.tsx')return entry.replaceAll('/src/','/@fs/'+root.split(path.sep).join('/')+'src/');}}],resolve:{alias:{'@':path.join(root,'src')},dedupe:['react','react-dom','react/jsx-runtime']},server:{host:'127.0.0.1',port:5173,strictPort:true,watch:null,fs:{allow:[root]}},define:{'import.meta.env.VITE_BACKEND_MODE':JSON.stringify('local')}});
await server.listen();console.log('GHN_NEW2_UI_FIXTURE_READY '+JSON.stringify({origin:server.resolvedUrls.local[0],noDatabase:true,noProviders:true}));
process.stdin.resume();process.once('SIGTERM',()=>void server.close());
