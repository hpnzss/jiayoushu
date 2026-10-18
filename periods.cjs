const {DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const {validDate}=require('./money.cjs');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const monthEnd=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5)),0)).toISOString().slice(0,10);
function openPeriods(filename,{state,today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date())}={}){
 const db=new DatabaseSync(filename);db.exec('CREATE TABLE IF NOT EXISTS monthly_periods(month TEXT PRIMARY KEY,payload TEXT NOT NULL);');
 const list=()=>db.prepare('SELECT payload FROM monthly_periods ORDER BY month').all().map(r=>{const p=JSON.parse(r.payload),summary=Object.fromEntries(['incomeCents','assetsCents','openingCents','deltaCents'].map(k=>[k,p.summary?.[k]??null]));return {...p,summary};});
 function assertWritable(dates){const closed=list().at(-1);if(closed&&dates.some(d=>typeof d==='string'&&d<=monthEnd(closed.month)))throw Error(`${closed.month}及以前已经关账，请管理员先重新打开有关月份，再修改历史数据。`);}
 function review(month){
  if(!validDate(month+'-01')||month>today().slice(0,7))throw Error('请选择有效月份。');
  const end=monthEnd(month),start=month+'-01',s=state(),saved=list().find(p=>p.month===month)||null;
  const accounts=s.accounts.filter(a=>(a.startDate||'2000-01-01')<=end&&(!a.archivedAt||a.archivedAt>end));
  const checks=accounts.map(a=>({id:a.id,name:a.name,kind:'余额',done:s.records.some(r=>r.type==='balance'&&r.account===a.id&&r.date===end)}));
  const baseline=s.snapshots.filter(p=>p.date<start).at(-1),closing=s.snapshots.filter(p=>p.date<=end).at(-1);
  const total=p=>p?.complete?p.amounts.reduce((a,b)=>a+b,0):null;
  const income=s.incomes.filter(r=>r.date>=start&&r.date<=end).reduce((a,b)=>a+b.cents,0),assets=total(closing),opening=total(baseline),delta=assets!==null&&opening!==null?assets-opening:null;
  const summary={incomeCents:income,assetsCents:assets,openingCents:opening,deltaCents:delta};
  const relevant={accounts:s.accounts.filter(a=>(a.startDate||'2000-01-01')<=end),records:s.records.filter(r=>r.type!=='expense'&&r.date<=end),holdings:s.portfolio?.records.filter(r=>r.date<=end)};
  return{month,end,closed:saved,checks,canClose:end<=today()&&checks.length>0&&checks.every(x=>x.done)&&assets!==null,summary,digest:digest(relevant),note:'关账保存本月总结并锁定历史金额。本软件只统计收入与资产，不推算消费、结余或投资收益。'};
 }
 function close(input,user){const r=review(input.month);if(r.closed)return r.closed;if(input.digest!==r.digest)throw Error('账本已更新，请重新检查本月填报。');if(!input.incomeConfirmed)throw Error('请确认本月收入和转账已录齐，没有收入也需确认。');if(!r.canClose)throw Error('请等整月结束，并核对所有账户月末余额和持仓估值，再关账。');const p={month:r.month,closedAt:new Date().toISOString(),closedBy:user.id,summary:r.summary,digest:r.digest};db.prepare('INSERT INTO monthly_periods VALUES(?,?)').run(p.month,JSON.stringify(p));return p;}
 function reopen(month){const last=list().at(-1);if(!last||last.month!==month)throw Error('只能先重新打开最近一次已关账月份；更早月份需按倒序逐个打开。');db.prepare('DELETE FROM monthly_periods WHERE month=?').run(month);}
 return{list,assertWritable,review,finish:close,reopen,close:()=>db.close()};
}
module.exports={openPeriods,monthEnd};
