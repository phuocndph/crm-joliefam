// Pure search and actual picker/selection handlers; synthetic memory only, no browser/API.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { normalizeProductSearch, calculateSearchScore, searchProducts } from '../src/lib/searchUtils.ts';
const make=(id,name,sku,category='GA CHUN T250 TRẮNG TRƠN',extra={})=>({id,name,sku,category,description:null,specifications:null,price:100,...extra});
const products=[make('a1','Ga chun','A1'),make('b1','Ga chun mới','B1','VỎ GỐI'),make('a2','Ga khác','A2'),make('long','Vỏ chăn cao cấp trắng cho phòng khách sạn với rất nhiều từ mô tả','VCT250-1M-T'),make('number','Ga trắng 25','NUM-25')];
let groups=0;const check=(label,run)=>{run();groups++;console.log('PASS product picker: '+label);};
const ids=query=>searchProducts(products,query).results.map(row=>row.id);
check('normalized accents, Unicode, case and gaps drive identical scores, membership and exact bonuses',()=>{
 const p=make('accent','Đệm trắng','ĐỆM-25');
 for(const query of ['ĐỆM trắng','  dem   trang  ','Đệm trắng'])assert.equal(calculateSearchScore(p,query),calculateSearchScore(p,'dem trang'));
 assert.equal(normalizeProductSearch('  GA\t CH  '),'ga ch');
 assert.equal(calculateSearchScore(p,' ĐỆM-25 '),calculateSearchScore(p,'dem-25'));
});
check('two-character word prefixes match while every token remains required and typos stay excluded',()=>{
 assert.ok(ids('ga ch').includes('a1'));assert.ok(ids('ga chu').includes('a1'));
 assert.ok(!ids('ga zz').length);assert.ok(!ids('ga cx').length);assert.ok(!ids('ga c').includes('a1'));
 assert.ok(!searchProducts([make('x','Bao hàng','X')],'ao').resultCount,'two-character infixes are not broadened');
});
check('25 whitespace has identical membership/order; long names cannot discard valid SKU matches',()=>{
 assert.deepEqual(ids('25'),ids(' 25 '));assert.ok(ids('25').includes('long'));
 for(const query of ['25',' 25 '])assert.equal(calculateSearchScore(products[3],query),calculateSearchScore(products[3],'25'));
});
check('complete SKU ranks first and literal token punctuation is safe',()=>{
 const rows=[make('name','VCT250-1M-T','OTHER'),products[3],make('suffix','VCT250-1M-T','VCT250-1M-T-EXTRA')];
 assert.equal(searchProducts(rows,'  vct250-1m-t ').results[0].id,'long');
 assert.equal(searchProducts([make('literal','Ga (trắng)','[X].25')],'[x].25').resultCount,1);
 assert.equal(searchProducts([], 'ga').resultCount,0);
});
check('empty-query browsing preserves category hierarchy and never mutates input',()=>{
 const frozen=Object.freeze([...products].reverse()),before=frozen.map(row=>row.id);
 const result=searchProducts(frozen,'  ');assert.deepEqual(frozen.map(row=>row.id),before);assert.equal(result.hasSearch,false);
 assert.deepEqual(Object.keys(result.groupedResults),['GA CHUN T250 TRẮNG TRƠN','VỎ GỐI']);
 assert.deepEqual(result.groupedResults['GA CHUN T250 TRẮNG TRƠN'].map(row=>row.sku),['A1','A2','NUM-25','VCT250-1M-T']);
});
const componentSource=await readFile(new URL('../src/components/QuoteProductPicker.tsx',import.meta.url),'utf8');
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const elements=(node,predicate)=>{if(!node||typeof node!=='object')return[];return[...(predicate(node)?[node]:[]),...React.Children.toArray(node.props?.children).flatMap(child=>elements(child,predicate))];};
const textOf=node=>typeof node==='string'||typeof node==='number'?String(node):React.Children.toArray(node?.props?.children).map(textOf).join('');
function harness(initialSearch='ga chun'){
 let cursor=0,states=[],cache=null;const selected=[],closed=[],focus=[],storage=new Map();
 const context=vm.createContext({React,normalizeProductSearch,setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
 useState(initial){const n=cursor++;if(!(n in states))states[n]=typeof initial==='function'?initial():initial;return[states[n],value=>{states[n]=typeof value==='function'?value(states[n]):value;}];},
 useRef(initial){const n=cursor++;if(!(n in states))states[n]={current:initial};return states[n];},useEffect(){},useId:()=> 'picker-test',
 useDebounce:value=>context.lag===undefined?value:context.lag,
 useProductSearch:(rows,query)=>{if(!cache||cache.rows!==rows||cache.query!==query)cache={rows,query,result:searchProducts(rows,query)};return cache.result;},
 Dialog:'Dialog',DialogContent:'DialogContent',DialogHeader:'DialogHeader',DialogTitle:'DialogTitle',DialogDescription:'DialogDescription',Input:'Input',Search:'Search'});
 vm.runInContext(compile(componentSource.replace(/^import .*;\r?\n/gm,'').replace('export function QuoteProductPicker','function QuoteProductPicker'))+'\nglobalThis.Component=QuoteProductPicker;',context);
 const props={products,ready:true,initialSearch,onSelect:p=>selected.push(p),onClose:()=>closed.push(true),onRestoreFocus:()=>focus.push(true)};
 const render=()=>{cursor=0;return context.Component(props);};
 return{context,props,selected,closed,focus,render,input:tree=>elements(tree,node=>node.type==='Input')[0],options:tree=>elements(tree,node=>node.props?.role==='option')};
}
const event=(key,extra={})=>({key,keyCode:0,nativeEvent:{isComposing:false},repeat:false,prevented:0,stopped:0,preventDefault(){this.prevented++;},stopPropagation(){this.stopped++;},...extra});
check('actual picker renders globally ranked options while browsing retains visible group order and four columns',()=>{
 const h=harness('ga chun'),tree=h.render(),options=h.options(tree);
 assert.deepEqual(options.map(row=>row.props.children[0].props.children),searchProducts(products,'ga chun').results.map(row=>row.sku));
 assert.equal(options[0].props.children.length,4);assert.ok(options.every(row=>row.type==='button'&&row.props.type==='button'));
 assert.deepEqual(options.slice(0,3).map(row=>row.props.children[0].props.children),['A1','B1','A2']);
 const browse=harness(''),view=browse.render();assert.equal(elements(view,node=>node.props?.role==='group').length,2);
 assert.deepEqual(browse.options(view).map(row=>row.props.children[0].props.children),Object.values(searchProducts(products,'').groupedResults).flat().map(row=>row.sku));
});
check('actual Arrow/Enter selects the active visible product exactly once and consumes form keys',()=>{
 const h=harness(),down=event('ArrowDown');h.input(h.render()).props.onKeyDown(down);assert.equal(down.prevented,1);assert.equal(down.stopped,1);
 let tree=h.render();assert.equal(h.input(tree).props['aria-activedescendant'],h.options(tree)[0].props.id);
 h.input(tree).props.onKeyDown(event('ArrowDown'));tree=h.render();assert.equal(h.options(tree)[1].props['aria-selected'],true);
 const enter=event('Enter');h.input(tree).props.onKeyDown(enter);h.input(tree).props.onKeyDown(event('Enter'));assert.equal(h.selected.length,1);assert.equal(h.selected[0].id,'b1');assert.equal(enter.prevented,1);
 const up=harness();up.input(up.render()).props.onKeyDown(event('ArrowUp'));const last=up.render();assert.equal(up.options(last).at(-1).props['aria-selected'],true);
});
check('pending query, stale callback, changed catalog, no results and IME cannot select a prior product',()=>{
 const h=harness(),old=h.options(h.render())[0];
 h.context.lag='ga chun';h.input(h.render()).props.onChange({target:{value:'no match'}});let tree=h.render();assert.equal(h.options(tree).length,0);assert.equal(h.input(tree).props['aria-activedescendant'],undefined);old.props.onClick();assert.equal(h.selected.length,0);
 h.input(tree).props.onKeyDown(event('Enter'));h.context.lag=undefined;tree=h.render();assert.equal(h.options(tree).length,0);h.input(tree).props.onKeyDown(event('ArrowDown'));assert.equal(h.selected.length,0);
 const c=harness(),oldCatalog=c.options(c.render())[0];c.props.products=[make('other','Gối','OTHER')];c.props.ready=false;tree=c.render();oldCatalog.props.onClick();assert.equal(c.selected.length,0);assert.equal(c.options(tree).length,0);
 const ime=harness();ime.input(ime.render()).props.onKeyDown(event('ArrowDown'));tree=ime.render();ime.input(tree).props.onKeyDown(event('Enter',{nativeEvent:{isComposing:true}}));assert.equal(ime.selected.length,0);
 const clear=harness('unknown');clear.input(clear.render()).props.onChange({target:{value:''}});assert.ok(clear.options(clear.render()).length>0);
});
check('mouse selection uses the same guard; Escape closes only the controlled picker and restores trigger focus',()=>{
 const h=harness(),tree=h.render();h.options(tree)[1].props.onClick();assert.equal(h.selected[0].id,'b1');
 const e=harness(),escape=event('Escape');e.input(e.render()).props.onKeyDown(escape);assert.equal(e.closed.length,1);assert.equal(e.selected.length,0);assert.equal(escape.prevented,1);assert.equal(escape.stopped,1);
 const content=elements(e.render(),node=>node.type==='DialogContent')[0];content.props.onCloseAutoFocus(event(''));assert.equal(e.focus.length,1);
});
const parent=await readFile(new URL('../src/components/CreateQuoteForm.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('form.tsx',parent,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let chooseSource,readySource;const visit=node=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)){if(node.name.text==='selectCatalogProduct')chooseSource=node.initializer.getText(ast);if(node.name.text==='productPickerReady')readySource=node.initializer.getText(ast);}ts.forEachChild(node,visit);};visit(ast);
check('actual parent selection preserves latest target quantity, stable line identity, other lines and calculation rule',()=>{
 const other={id:'other',name:'Keep',price:7,quantity:4,total:28,selectedImage:'saved'},target={id:'target',name:'Old',quantity:3.5,price:2,total:7},context=vm.createContext({productPickerReady:true,productPickerTarget:{lineId:'target'},products,lines:[other,target],toasts:[],priceEditing:{target:'1,',other:'7,'},setPriceEditing:update=>{context.priceEditing=typeof update==='function'?update(context.priceEditing):update;},setSelectedProducts:update=>{context.lines=update(context.lines);},setProductPickerTarget:value=>{context.productPickerTarget=value;},toast:value=>context.toasts.push(value)});
 vm.runInContext(compile('globalThis.choose='+chooseSource+';'),context);context.choose(products[1]);assert.equal(context.lines[0],other);assert.equal(context.lines[1].id,'target');assert.equal(context.lines[1].quantity,3.5);assert.equal(context.lines[1].total,350);assert.equal(context.lines[1].originalProductId,'b1');assert.equal(context.productPickerTarget,null);assert.equal(context.toasts.length,1);assert.equal(context.priceEditing.target,undefined);assert.equal(context.priceEditing.other,'7,');
 context.productPickerReady=false;context.choose(products[0]);assert.equal(context.toasts.length,1);
 assert.ok(readySource.includes('productPickerTarget.catalog === products'));assert.ok(readySource.includes('line.id === productPickerTarget.lineId'));
 assert.equal((parent.match(/<QuoteProductPicker\b/g)||[]).length,1);assert.ok(!parent.includes('setCurrentEditingIndex'));
});
console.log('QUOTE PRODUCT PICKER: '+groups+' groups passed.');

