const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openLedger}=require('./ledger.cjs'),{openPortfolio,combineState}=require('./portfolio.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-currency-test-')),file=path.join(dir,'test.sqlite');
let q={rateDate:'2026-01-01',source:'合成测试',fetchedAt:'2026-01-01T01:00:00Z',toCny:{USD:7,HKD:.9,CNY:1}},p,l,n=0;
p=openPortfolio(file,{quote:()=>q,today:()=> '2026-10-20',reservedAccountIds:()=>l?l.registeredAccounts().map(a=>a.id):[],cashBalanceExists:(id,date)=>l?l.ownRows().some(r=>r.account===id&&r.date===date&&r.type==='balance'):false});
l=openLedger(file,{quote:()=>q,portfolioRecords:()=>p.records()});
const packet=records=>({format:'family-assets-import',version:2,batchId:'currency-test-'+(++n),records});
const save=input=>{const draft=l.preview(input);return l.commitPrepared(draft.prepared,draft.signature);};
try{
  const baseline=packet(['a','b','c','d'].map((account,i)=>({type:'balance',date:'2026-01-01',account,amount:i===0?'10000.00':'0.00'})));save(baseline);
  const usd=l.saveAccount({name:'美元账户',owner:'成员一',type:'外币余额',currency:'USD',date:'2026-01-01',amount:'100.00'});
  const income=packet([{type:'income',date:'2026-01-02',account:usd.id,member:'成员一',source:'工资',amount:'50.00'}]);
  const frozen=l.preview(income);q={...q,toCny:{USD:8,HKD:.9,CNY:1}};l.commitPrepared(frozen.prepared,frozen.signature);
  assert.equal(l.state().incomes.at(-1).cents,35000);assert.equal(l.state().incomes.at(-1).nativeCents,5000);
  assert.equal(l.state().balances.find(a=>a.id===usd.id).nativeCents,15000);assert.equal(l.state().balances.find(a=>a.id===usd.id).cents,105000);
  assert(l.preview(income).alreadyImported);assert(l.commitPrepared(frozen.prepared,frozen.signature).alreadyImported);
  q={...q,toCny:{USD:7,HKD:.9,CNY:1}};
  const exchange=packet([{type:'transfer',date:'2026-01-03',account:'a',target:usd.id,amount:'700.00',targetAmount:'100.00',fee:'2.00'}]);save(exchange);
  let state=l.state();assert.equal(state.balances.find(a=>a.id==='a').nativeCents,929800);assert.equal(state.balances.find(a=>a.id===usd.id).nativeCents,25000);assert.equal(state.incomes.length,1);
  assert.equal(state.snapshots.at(-1).amounts.reduce((s,x)=>s+x,0),1104800);
  // 重命名不改变记录所关联的账户编号。
  l.saveAccount({id:usd.id,name:'美元工资卡',owner:'成员一',type:'银行卡'});assert.equal(l.state().incomes.at(-1).account,usd.id);assert.equal(l.state().accounts.find(a=>a.id===usd.id).name,'美元工资卡');
  assert.throws(()=>l.saveAccount({id:usd.id,name:'改币种',owner:'成员一',type:'银行卡',currency:'HKD'}),/币种/);
  assert.throws(()=>l.preview(packet([{type:'transfer',date:'2026-01-04',account:'a',target:usd.id,amount:'7.00'}])),/到账/);
  assert.throws(()=>l.preview(packet([{type:'transfer',date:'2026-01-04',account:'a',target:'b',amount:'10.00',targetAmount:'9.00'}])),/须相同/);
  const empty=packet([{type:'income',date:'2026-01-04',account:usd.id,member:'成员二',source:'兼职',amount:'1.00'}]);const preview=l.preview(empty),tampered=structuredClone(preview.prepared);tampered.rows[0].cents=1000000;assert.throws(()=>l.commitPrepared(tampered,preview.signature),/校验/);
  q={...q,rateDate:'2026-01-05'};assert.throws(()=>l.preview(packet([{type:'income',date:'2026-01-04',account:usd.id,member:'成员二',source:'兼职',amount:'1.00'}])),/历史/);
  save(packet([{type:'balance',date:'2026-01-04',account:usd.id,amount:'240.00',fx:{rate:'7',date:'2026-01-04',source:'历史测试'}}]));
  save(packet([{type:'income',date:'2026-01-03',account:usd.id,member:'成员二',source:'历史兼职',amount:'5.00',fx:{rate:'7',date:'2026-01-03',source:'历史测试'}}]));assert.equal(l.state().balances.find(a=>a.id===usd.id).nativeCents,24000);
  // 原有外币余额持仓也接上流水，只在家庭合计中出现一次。
  const asset={id:'portfolio-usd',name:'持仓美元余额',owner:'成员二',kind:'cash',currency:'USD',origin:'other'};
  const pp=p.preview({format:'family-assets-portfolio',version:1,batchId:'currency-portfolio-cash',records:[{date:'2026-01-05',asset,amount:'10.00'}]});p.commit(pp.prepared,pp.signature);
  save(packet([{type:'income',date:'2026-01-06',account:asset.id,member:'成员二',source:'兼职',amount:'5.00'}]));state=combineState(l.state(),p.records());assert.equal(state.accounts.filter(a=>a.id===asset.id).length,1);assert.equal(state.balances.find(a=>a.id===asset.id).nativeCents,1500);assert.equal(state.portfolio.held.find(r=>r.asset.id===asset.id).nativeCents,1500);
  const hkd=l.saveAccount({name:'同日起始测试',owner:'成员一',type:'外币余额',currency:'HKD',date:'2026-01-06',amount:'10.00'});save(packet([{type:'income',date:'2026-01-06',account:hkd.id,member:'成员一',source:'同日收入',amount:'5.00'}]));assert.equal(l.state().balances.find(a=>a.id===hkd.id).nativeCents,1500);
  save(packet([{type:'balance',date:'2026-01-07',time:'10:00:00',account:'a',amount:'9000.00'},{type:'transfer',date:'2026-01-07',time:'11:00:00',account:'a',target:'b',amount:'100.00'}]));assert.equal(l.state().balances.find(a=>a.id==='a').nativeCents,890000);
  save(packet([{type:'income',date:'2026-01-07',time:'09:00:00',account:'a',member:'成员一',source:'早于盘点补录',amount:'10.00'}]));assert.equal(l.state().balances.find(a=>a.id==='a').nativeCents,890000);
  save(packet([{type:'balance',date:'2026-01-07',time:'12:00:00',account:'a',amount:'8800.00'},{type:'income',date:'2026-01-07',time:'13:00:00',account:'a',member:'成员一',source:'盘点后收入',amount:'10.00'}]));assert.equal(l.state().balances.find(a=>a.id==='a').nativeCents,881000);
  const count=l.state().records.length;l.close();l=openLedger(file,{quote:()=>q,portfolioRecords:()=>p.records()});assert.equal(l.state().records.length,count);assert.equal(l.registeredAccounts().find(a=>a.id===usd.id).name,'美元工资卡');
  console.log('外币流水检查通过：账户创建和改名、冻结收入汇率、换汇两侧金额与费用、原币余额、历史校准、持仓现金不重复、签名和持久化。');
}finally{l.close();p.close();fs.rmSync(dir,{recursive:true,force:true});}
