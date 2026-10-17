(function(root){
 const P=typeof module!=='undefined'&&module.exports?require('./history-period.js'):root.FamilyHistoryPeriod;
 function series(incomes,members,{grain='month',start,end,today}={}){
  const size=grain==='year'?4:7,from=start.slice(0,size),to=(end>today?today:end).slice(0,size),labels=[];let key=from;
  while(key<=to&&labels.length<1200){labels.push(key);if(grain==='year')key=String(Number(key)+1);else{const [y,m]=key.split('-').map(Number);key=m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0');}}
  const maps=new Map(members.map(k=>[k,new Map()]));
  let unallocated=0;for(const r of incomes){if(r.historical&&P.overlaps(r,{start,date:end})&&(!P.contains(r,start,end)||!P.fits(r,grain)))unallocated++;if(r.date<start||r.date>end||r.date>today||!maps.has(r.member)||(r.historical&&(!P.contains(r,start,end)||!P.fits(r,grain))))continue;const m=maps.get(r.member),k=r.date.slice(0,size);m.set(k,(m.get(k)||0)+r.cents);}
  const lines=members.map(member=>({member,values:labels.map(k=>maps.get(member).get(k)??null)}));
  const family={member:'家庭合计',values:labels.map((k,i)=>members.length&&lines.every(l=>l.values[i]!==null)?lines.reduce((s,l)=>s+l.values[i],0):null)};
  return{labels,lines:[...lines,family],grain,unallocated,partial:labels.map(k=>grain==='year'?k===today.slice(0,4):k===today.slice(0,7))};
 }
 const api={series};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FamilyIncomeSeries=api;
})(typeof globalThis!=='undefined'?globalThis:this);
