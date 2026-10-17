(function(root){
 const valid=s=>{try{return /^20\d{2}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}catch{return false;}};
 const monthEnd=m=>new Date(Date.UTC(+m.slice(0,4),+m.slice(5),0)).toISOString().slice(0,10);
 function parse(text){
  if(typeof text!=='string')throw Error('请填写期间。');text=text.trim().replaceAll('/','-').replace(/[～至]/g,'~');let start,end;
  if(/^20\d{2}$/.test(text)){start=text+'-01-01';end=text+'-12-31';}
  else if(/^20\d{2}-\d{1,2}$/.test(text)){const [y,m]=text.split('-');start=y+'-'+m.padStart(2,'0')+'-01';if(!valid(start))throw Error('月份无效。');end=monthEnd(start.slice(0,7));}
  else{const parts=text.split('~');if(parts.length>2)throw Error('期间格式无效。');const normalize=s=>s.split('-').map((x,i)=>i?x.padStart(2,'0'):x).join('-');start=normalize(parts[0]);end=parts.length===2?normalize(parts[1]):start;}
  if(!valid(start)||!valid(end)||start>end)throw Error('期间需为日期、月份、年份，或开始日期~结束日期（2000年起）。');
  const grain=start===end?'day':start.slice(5)==='01-01'&&end===start.slice(0,4)+'-12-31'?'year':start.endsWith('-01')&&end===monthEnd(start.slice(0,7))?'month':'range';
  return{start,end,grain,label:grain==='year'?start.slice(0,4):grain==='month'?start.slice(0,7):grain==='day'?start:start+'~'+end};
 }
 const bounds=r=>({start:r.start||(r.month?r.month+'-01':r.date),end:r.date});
 const contains=(r,start,end)=>{const b=bounds(r);return b.start>=start&&b.end<=end;};
 const overlaps=(a,b)=>{a=bounds(a);b=bounds(b);return a.start<=b.end&&b.start<=a.end;};
 const fits=(r,grain)=>{const b=bounds(r),n=grain==='year'?4:7;return b.start.slice(0,n)===b.end.slice(0,n);};
 const label=r=>r.month||r.period||r.date;
 const key=r=>r.month?'income|'+r.month+'|'+r.member:'income-range|'+r.start+'|'+r.date+'|'+r.member;
 const api={parse,bounds,contains,overlaps,fits,label,key};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FamilyHistoryPeriod=api;
})(typeof globalThis!=='undefined'?globalThis:this);
