const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openPortfolio,combineState}=require('./portfolio.cjs'),{openLedger}=require('./ledger.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-portfolio-test-')),file=path.join(dir,'test.sqlite');
let q={rateDate:'2026-10-14',source:'合成测试汇率',fetchedAt:'2026-10-15T01:00:00Z',toCny:{USD:7,CNY:1}},n=0;
let p=openPortfolio(file,{quote:()=>q,today:()=> '2026-10-20'}),l=openLedger(file);
const a={id:'usd-cash',name:'测试美元现金',owner:'成员一',kind:'cash',currency:'USD',origin:'other'};
const stock={id:'espp-stock',name:'测试ESPP',owner:'成员二',kind:'stock',currency:'USD',origin:'espp',symbol:'TEST:DEMO'};
const rsu={id:'rsu-pending',name:'测试待归属RSU',owner:'成员二',kind:'rsu',currency:'USD',origin:'rsu',symbol:'TEST:DEMO'};
const pack=records=>({format:'family-assets-portfolio',version:1,batchId:'portfolio-test-'+(++n),records});
const save=input=>{const x=p.preview(input);p.commit(x.prepared,x.signature);return x;};
try{
  const baseline={format:'family-assets-import',version:1,currency:'CNY',batchId:'portfolio-legacy-baseline',records:['a','b','c','d'].map(account=>({type:'balance',date:'2026-10-01',account,amount:'0.00'}))};const bp=l.preview(baseline);l.commit(baseline,bp.digest);
  const input=pack([{date:'2026-10-15',asset:a,amount:'100.00'},{date:'2026-10-15',asset:stock,quantity:'10.5',price:'20',priceDate:'2026-10-14'},{date:'2026-10-15',asset:rsu,quantity:'100',price:'20',priceDate:'2026-10-14',vestDate:'2027-01-01'}]);
  const draft=p.preview(input);assert.equal(p.records().length,0);assert.equal(draft.prepared.rows[1].nativeCents,21000);
  // 预览后报价改变，确认保存的仍然是核对过的7，不是新的8。
  q={...q,toCny:{USD:8,CNY:1}};p.commit(draft.prepared,draft.signature);
  assert.equal(p.commit(draft.prepared,draft.signature).alreadyImported,true);assert.equal(p.records().length,3);
  let state=combineState(l.state(),p.records());assert.equal(state.portfolio.pendingCnyCents,1400000);assert.equal(state.snapshots.at(-1).amounts.reduce((a,b)=>a+b,0),217000);assert.equal(state.incomes.length,0);
  assert(!state.accounts.some(x=>x.id===rsu.id));
  save(pack([{date:'2026-10-16',asset:a,amount:'100.00'}]));
  state=combineState(l.state(),p.records());assert.equal(state.snapshots.find(s=>s.date==='2026-10-15').amounts.reduce((a,b)=>a+b,0),217000);assert.equal(state.snapshots.at(-1).amounts.reduce((a,b)=>a+b,0),227000);
  assert.throws(()=>p.preview(pack([{date:'2026-10-10',asset:a,amount:'1.00'}])),/晚于历史/);
  save(pack([{date:'2026-10-10',asset:a,amount:'50.00',fx:{rate:'6.5',date:'2026-10-09',source:'历史合成测试'}}]));
  assert.throws(()=>p.preview(pack([{date:'2026-10-16',asset:a,amount:'2.00'}])),/同一天/);
  assert.throws(()=>p.preview(pack([{date:'2026-10-17',asset:{...a,currency:'EUR'},amount:'2.00'}])),/保持一致/);
  const next=p.preview(pack([{date:'2026-10-17',asset:a,amount:'1.00'}]));const modified=structuredClone(next.prepared);modified.rows[0].cnyCents=1;assert.throws(()=>p.commit(modified,next.signature),/校验/);
  assert.throws(()=>p.preview(pack([{date:'2026-10-17',asset:a,amount:'-1.00'}])),/格式/);
  assert.throws(()=>p.preview(pack([{date:'2026-10-21',asset:a,amount:'1.00'}])),/未来/);
  const before=p.records().length;assert.throws(()=>p.preview(pack([{date:'2026-10-17',asset:a,amount:'1.00'},{date:'2026-10-17',asset:a,amount:'1.00'}])),/同一天/);assert.equal(p.records().length,before);
  p.close();p=openPortfolio(file,{quote:()=>q,today:()=> '2026-10-20'});assert.equal(p.records().length,before);assert.equal(p.preview(input).alreadyImported,true);
  console.log('多币种与持仓检查通过：精确折算、小数股、RSU排除、ESPP非收入、预览固定汇率、历史不改写、历史补录、幂等、草稿防篡改及重开读取。');
}finally{p.close();l.close();fs.rmSync(dir,{recursive:true,force:true});}
