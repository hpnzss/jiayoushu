const {validDate}=require('./money.cjs'),{monthEnd}=require('./periods.cjs');
function previewPeriod(state,month,through,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date())){
 if(!validDate(month+'-01')||month>today.slice(0,7))throw Error('请选择有效月份。');
 const end=monthEnd(month),asOf=through||[end,today].sort()[0],start=month+'-01';
 if(!validDate(asOf)||asOf<start||asOf>end||asOf>today)throw Error('预览截至日期必须在所选月份内且不晚于今天。');
 const accounts=state.accounts.filter(a=>(a.startDate||start)<=asOf),checks=accounts.map(a=>({id:a.id,name:a.name,done:state.records.some(r=>r.type==='balance'&&r.account===a.id&&r.date===asOf)}));
 const total=p=>p?.complete?p.amounts.reduce((s,v)=>s+v,0):null;
 const openingSnapshot=state.snapshots.filter(p=>p.date<start).at(-1),closingSnapshot=state.snapshots.filter(p=>p.date<=asOf).at(-1),opening=total(openingSnapshot),assets=total(closingSnapshot);
 const income=state.incomes.filter(r=>r.date>=start&&r.date<=asOf).reduce((s,r)=>s+r.cents,0),delta=opening===null||assets===null?null:assets-opening;
 return{month,asOf,openingDate:openingSnapshot?.date||null,assetsDate:closingSnapshot?.date||null,final:false,locked:false,checks,summary:{incomeCents:income,assetsCents:assets,openingCents:opening,deltaCents:delta},note:'临时结果只读取已保存资料，不改变关账状态。资产可能沿用旧余额；只统计收入与资产，缺少资料不当作0，不推算消费或整月结果。'};
}
module.exports={previewPeriod};
