'use strict';
// Run every shipped script against a connected DOM. Lightweight selector mocks
// cannot catch lookups failing when a panel has been detached from the document.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const modules=process.env.FAMILY_QA_NODE_MODULES;
if(!modules)throw Error('Set FAMILY_QA_NODE_MODULES to the test-only jsdom node_modules directory.');
const {JSDOM,VirtualConsole}=require(path.join(modules,'jsdom'));
const base=path.join(__dirname,'prototype'),html=fs.readFileSync(path.join(base,'index.html'),'utf8'),errors=[],frames=[];
const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{url:'http://synthetic.test/#summary',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;
// All data are bundled examples. Never connect this harness to a live NAS or API.
w.fetch=()=>new Promise(()=>{});w.scrollTo=()=>{};w.requestAnimationFrame=f=>frames.push(f);
w.ResizeObserver=class{observe(){}};w.matchMedia=()=>({matches:false,addEventListener(){}});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.addEventListener('error',e=>errors.push(e.message));
try{
 for(const [,file]of html.matchAll(/<script defer src="([^"]+)"/g)){
  try{new vm.Script(fs.readFileSync(path.join(base,file),'utf8'),{filename:file}).runInContext(dom.getInternalVMContext());}catch(e){errors.push(file+': '+e.message);}
 }
 for(let count=0;frames.length&&count<100;count++)frames.shift()();
 assert.deepEqual(errors,[],'Full page initialization must not throw');
 const doc=w.document,tabs=doc.querySelector('.overview-tabs');assert(tabs?.isConnected,'Analysis tabs must be attached');
 assert.deepEqual([...tabs.querySelectorAll('a')].map(a=>a.textContent),['概览','资产分析','收入分析']);
 assert.equal(doc.querySelectorAll('.sidebar [data-route]').length,4);
 assert.equal(doc.documentElement.dataset.navigation,'four');
 assert.equal(typeof doc.getElementById('accountForm').onsubmit,'function','Account tools must finish initializing');
 assert.equal(typeof doc.getElementById('manualForm').onsubmit,'function','Income form must finish initializing');
 for(const [hash,visible]of [['summary','summary'],['income','income'],['asset-analysis','asset-analysis']]){
  new vm.Script(`location.hash=${JSON.stringify('#'+hash)};route();`).runInContext(dom.getInternalVMContext());
  assert.equal(doc.querySelector('[data-page=overview]').hidden,false);
  for(const key of ['summary','income','asset-analysis'])assert.equal(doc.getElementById('overview-'+key).hidden,key!==visible,key);
 }
 assert.equal(doc.getElementById('deltaValue'),null);
 assert.equal(doc.getElementById('overviewMetrics').isConnected,true);
 assert.equal(doc.getElementById('incomeValue').closest('#overviewCompatibility').hidden,true);
 process.stdout.write('完整页面检查通过：所有脚本无初始化异常、三个标签实际生成并可切换、四个导航、收入和账户表单初始化完成、旧资产变化指标移除。\n');
}finally{dom.window.close();}
