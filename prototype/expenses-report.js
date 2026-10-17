(function(root){
  'use strict';
  function moneySum(rows){const result=Number(rows.reduce((s,r)=>s+BigInt(r.cents),0n));if(!Number.isSafeInteger(result))throw Error('支出合计超出安全计算范围。');return result;}
  function report(records,summaries,start,end){
    const rows=[],unresolved=[];
    const householdMonths=new Set(summaries.filter(s=>s.scope==='household').map(s=>s.month));
    const active=summaries.filter(s=>s.mode==='total'&&(s.scope==='household'||!householdMonths.has(s.month)));
    for(const s of active){
      const from=s.month+'-01';
      if(s.through<start||from>end)continue;
      if(start<=from&&end>=s.through)rows.push({kind:'total',month:s.month,date:s.through,from,member:'共同',cents:s.cents,breakdown:s.breakdown,category:'家庭月度支出',memo:s.memo,through:s.through,legacy:s.scope!=='household'});
      else unresolved.push(s);
    }
    // 月总额已包含手续费，不再从转账或旧明细额外叠加支出。
    const knownCents=moneySum(rows),hasData=rows.length>0||unresolved.length>0;
    const legacyDetails=records.filter(r=>r.type==='expense'&&r.date>=start&&r.date<=end&&!householdMonths.has(r.date.slice(0,7))).length;
    rows.sort((a,b)=>a.date.localeCompare(b.date));
    const groups=new Map();for(const r of rows)for(const b of r.breakdown||[{member:'共同',cents:r.cents}])groups.set(b.member,(groups.get(b.member)||0)+b.cents);
    return{rows,unresolved,suppressed:[],legacyDetails,hasData,knownCents,cents:hasData&&!unresolved.length?knownCents:null,byMember:[...groups].map(([name,cents])=>({name,cents})),fees:0};
  }
  const api={report};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FamilyExpenses=api;
})(typeof globalThis!=='undefined'?globalThis:this);
