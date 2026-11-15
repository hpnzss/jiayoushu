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
 assert.deepEqual([...tabs.querySelectorAll('a')].map(a=>a.textContent),['资产分析','收入分析']);
 assert.equal(doc.querySelectorAll('.sidebar [data-route]').length,4);
 assert.equal(doc.documentElement.dataset.navigation,'four');
 assert.equal(typeof doc.getElementById('accountForm').onsubmit,'function','Account tools must finish initializing');
 assert.equal(typeof doc.getElementById('manualForm').onsubmit,'function','Income form must finish initializing');
 for(const [hash,visible]of [['summary','asset-analysis'],['income','income'],['asset-analysis','asset-analysis']]){
  new vm.Script(`location.hash=${JSON.stringify('#'+hash)};route();`).runInContext(dom.getInternalVMContext());
  assert.equal(doc.querySelector('[data-page=overview]').hidden,false);
  for(const key of ['income','asset-analysis'])assert.equal(doc.getElementById('overview-'+key).hidden,key!==visible,key);
 }
 assert.equal(doc.getElementById('deltaValue'),null);
 assert.equal(doc.getElementById('overviewMetrics').isConnected,true);
 const run=s=>new vm.Script(s).runInContext(dom.getInternalVMContext());
 const query=doc.querySelector('[data-page=records]');
 assert.equal(doc.querySelector('[data-route=records]').textContent.includes('记录查询'),true);
 assert.equal(doc.getElementById('details').hidden,true);
 assert.equal(doc.getElementById('export').closest('[data-page=records]'),query);
 assert.equal(doc.querySelector('#overview-income > article').id,'income');
 assert.equal(doc.querySelector('#overview-income .history-entry'),null);
 assert.equal(doc.getElementById('incomeSummary').hidden,true);
 assert.equal(doc.getElementById('reconciliationRows'),null);
 run("location.hash='#assets';route()");
 assert.equal(doc.getElementById('monthPane-accounts').hidden,false);
 assert.equal(doc.getElementById('monthPane-flows').hidden,true);
 run("location.hash='#entry-balances';route()");
 assert.equal(doc.getElementById('monthPane-balances').hidden,false);
 assert.equal(doc.getElementById('monthPane-accounts').hidden,true);
 run("location.hash='#details';route()");
 assert.equal(query.hidden,false);
 assert.equal(doc.getElementById('recentRecords').closest('#monthPane-flows')?.id,'monthPane-flows');
 run(`D.live=true;D.history=[];D.records=[{type:'income',date:D.today,cents:1000,currency:'CNY',member:'成员一',account:D.accounts[0].id,order:1,source:'工资'},{type:'transfer',date:D.today,cents:500,currency:'CNY',account:D.accounts[0].id,target:D.accounts[1].id,order:2}];D.balances=D.accounts.map(a=>({...a,cents:2000,nativeCents:2000,currency:'CNY'}));D.memberProfiles=[{key:'成员一',name:'成员一',active:true},{key:'成员二',name:'成员二',active:true}];FamilyRecordLayout.draw(true);FamilyIncomeCharts.render();FamilyAssetDistribution.render();`);
 assert.equal(query.querySelectorAll('tbody tr').length,2);
 assert.equal(doc.querySelectorAll('#recentRecords tbody tr').length,2);
 query.querySelector('[name=kind]').value='transfer';query.querySelector('form').dispatchEvent(new w.Event('change'));
 assert.equal(query.querySelectorAll('tbody tr').length,1);
 assert.match(query.querySelector('tbody').textContent,/转账/);
 assert.equal(doc.querySelectorAll('#reportIncomeLines .income-data, #incomeYearComparison .income-data').length,2);
 assert.equal(doc.querySelector('#reportProvidentLines details').open,false);
 assert.equal(doc.querySelectorAll('#overview-asset-analysis .report-table').length,2);
 process.stdout.write('完整页面检查通过：分析与录入标签、别名导航、明细实时筛选、收入常显表格、资产分布表及表单初始化。\n');
}finally{dom.window.close();}
