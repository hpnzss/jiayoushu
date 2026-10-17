const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {openLedger}=require('./ledger.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-ledger-test-'));
const filename=path.join(dir,'test.sqlite');
let l=openLedger(filename), seq=0;
const batch=records=>({format:'family-assets-import',version:1,currency:'CNY',batchId:'test-batch-'+(++seq),records});
const save=b=>{const p=l.preview(b);return l.commit(b,p.digest);};
try {
  const initial=batch(['a','b','c','d'].map((account,i)=>({type:'balance',date:'2026-01-01',account,amount:i===0?'50000.00':'0.00'})));
  assert.equal(save(initial).count,4);
  assert.equal(save(initial).alreadyImported,true);
  assert.equal(l.state().records.length,4);
  const flows=batch([
    {type:'income',date:'2026-01-02',account:'a',member:'成员一',source:'工资',amount:'15000.00'},
    {type:'transfer',date:'2026-01-03',account:'a',target:'b',amount:'20000.00',fee:'2.00'},
    {type:'balance',date:'2026-01-04',account:'a',amount:'41000.00'}
  ]);
  save(flows);
  let state=l.state();
  assert.equal(state.balances[0].cents,4100000);
  assert.equal(state.balances[1].cents,2000000);
  assert.equal(state.adjustments.at(-1).cents,-399800);
  assert.equal(state.incomes.length,1);
  // 补录发生在检查点之前的收入，不增加检查点后的余额。
  save(batch([{type:'income',date:'2026-01-03',account:'a',member:'成员二',source:'兼职',amount:'1000.00'}]));
  state=l.state();
  assert.equal(state.balances[0].cents,4100000);
  assert.equal(state.adjustments.at(-1).cents,-499800);
  // 同日最终余额晚于收入应用，不重复累计工资。
  save(batch([{type:'balance',date:'2026-01-05',account:'a',amount:'62000.00'},{type:'income',date:'2026-01-05',account:'a',member:'成员一',source:'奖金',amount:'15000.00'}]));
  assert.equal(l.state().balances[0].cents,6200000);
  const duplicate=batch([{type:'income',date:'2026-01-05',account:'a',member:'成员一',source:'奖金',amount:'15000.00'}]);
  assert(l.preview(duplicate).warnings.some(w=>w.startsWith('已有完全相同')));
  assert.throws(()=>l.commit(duplicate,l.preview(duplicate).digest),/重复/);
  const before=l.state().records.length;
  assert.throws(()=>save(batch([{type:'income',date:'2026-02-30',account:'a',member:'成员一',source:'工资',amount:'10.00'}])),/日期/);
  assert.throws(()=>save(batch([{type:'transfer',date:'2026-02-01',account:'a',target:'a',amount:'1.00'}])),/转入/);
  assert.throws(()=>save(batch([{type:'balance',date:'2026-01-05',account:'a',amount:'123.00'}])),/已有同一天/);
  assert.throws(()=>save(batch([{type:'income',date:'2026-02-01',account:'a',member:'成员一',source:'工资',amount:'1.001'}])),/金额/);
  assert.equal(l.state().records.length,before);
  l.close();l=openLedger(filename);
  assert.equal(l.state().records.length,before);
  assert.equal(l.state().balances[0].cents,6200000);
  const empty=openLedger(':memory:');
  const p=empty.preview(batch([{type:'income',date:'2026-01-01',account:'a',member:'成员一',source:'工资',amount:'1.00'}]));
  empty.commit({format:'family-assets-import',version:1,currency:'CNY',batchId:p.batchId,records:[{type:'income',date:'2026-01-01',account:'a',member:'成员一',source:'工资',amount:'1.00'}]},p.digest);
  assert.equal(empty.state().balances[0].cents,null);
  assert.equal(empty.state().snapshots[0].complete,false);empty.close();
  console.log('账本检查通过：保存重开、整批事务、转账和手续费、历史补录、同日收入加最终余额、重复提交、未知初始余额及非法输入。');
}finally{l.close();fs.rmSync(dir,{recursive:true,force:true});}
