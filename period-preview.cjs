const {validDate}=require('./money.cjs'),{monthEnd}=require('./periods.cjs');
function previewPeriod(state,month,through,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date())){
 if(!validDate(month+'-01')||month>today.slice(0,7))throw Error('请选择有效月份。');
 const end=monthEnd(month),asOf=through||[end,today].sort()[0],start=month+'-01';
 if(!validDate(asOf)||asOf<start||asOf>end||asOf>today)throw Error('预览截至日期必须在所选月份内且不晚于今天。');
 const accounts=state.accounts.filter(a=>(a.startDate||start)<=asOf),checks=accounts.map(a=>({id:a.id,name:a.name,done:state.records.some(r=>r.type==='balance'&&r.account===a.id&&r.date===asOf)}));
 const total=p=>p?.complete?p.amounts.reduce((s,v)=>s+v,0):null;
 const openingSnapshot=state.snapshots.filter(p=>p.date<start).at(-1),closingSnapshot=state.snapshots.filter(p=>p.date<=asOf).at(-1),opening=total(openingSnapshot),assets=total(closingSnapshot);
 const expense=state.expenseSummaries.find(e=>e.scope==='household'&&e.month===month&&e.through<=asOf),income=state.incomes.filter(r=>r.date>=start&&r.date<=asOf).reduce((s,r)=>s+r.cents,0),expenseCents=expense?.cents??null,delta=opening===null||assets===null?null:assets-opening;
 return{month,asOf,openingDate:openingSnapshot?.date||null,assetsDate:closingSnapshot?.date||null,final:false,locked:false,checks,expenseThrough:expense?.through||null,summary:{incomeCents:income,expenseCents,netCents:expenseCents===null?null:income-expenseCents,assetsCents:assets,openingCents:opening,deltaCents:delta,unexplainedCents:delta===null||expenseCents===null||expense.through!==asOf||checks.some(c=>!c.done)?null:delta-income+expenseCents},note:'临时结果只读取已保存资料，不改变关账状态。资产可能沿用旧余额；支出统计到所填截止日；缺少资料不当作0，不推算尚未发生的整月结果。'};
}
module.exports={previewPeriod};
