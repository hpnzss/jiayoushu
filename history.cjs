const {DatabaseSync}=require('node:sqlite');
const {randomBytes,createHash}=require('node:crypto');
const {validDate,scaled,safe}=require('./money.cjs');
const P=require('./prototype/history-period.js');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function ensureSchema(db){db.exec('CREATE TABLE IF NOT EXISTS history_records(key TEXT PRIMARY KEY,payload TEXT NOT NULL);');}
function parseTable(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>900000)throw Error('请使用不超过900KB的CSV或粘贴表格。');
 text=text.replace(/^\uFEFF/,'');const delimiter=text.slice(0,text.indexOf('\n')<0?text.length:text.indexOf('\n')).includes('\t')?'\t':',';
 const rows=[];let row=[],value='',quoted=false,ended=false;
 for(let i=0;i<=text.length;i++){const c=text[i];if(quoted){if(c===undefined)throw Error('CSV引号没有闭合。');if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;ended=true;}}else value+=c;continue;}
  if(c==='"'){if(value||ended)throw Error('CSV引号位置无效。');quoted=true;continue;}
  if(c===delimiter||c==='\n'||c===undefined){row.push(value.trim());value='';ended=false;if(c!==delimiter){if(row.some(v=>v!==''))rows.push(row);row=[];}continue;}
  if(c==='\r'&&text[i+1]==='\n')continue;if(ended&&c!==' '&&c!=='\r')throw Error('CSV引号后的内容无效。');if(!ended)value+=c;
 }
 if(rows.length<2||rows.length>2001)throw Error('需要表头和1至2000行数据。');return rows;
}
function amount(text){if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))throw Error('金额需为非负数字，最多两位小数；空白与0不同。');return safe(scaled(text.replaceAll(',','').replace(/^0+(?=\d)/,'')));}
function dateText(value,monthly=false){const p=value.replaceAll('/','-').split('-');if(p.length!==(monthly?2:3))throw Error(monthly?'月份格式为YYYY-MM。':'日期格式为YYYY-MM-DD。');const out=p.map((v,i)=>i?v.padStart(2,'0'):v).join('-');if(!validDate(monthly?out+'-01':out))throw Error('月份或日期无效（支持2000年起）。');return out;}
function validateStored(r,key){if(!r||!['income','assets'].includes(r.kind)||!Number.isSafeInteger(r.cents)||r.cents<0||typeof r.memo!=='string'||r.memo.length>200||!validDate(r.date))throw Error('历史记录字段无效。');if(r.kind==='income'){const period=P.parse(P.label(r)),b=P.bounds(r);if(period.start!==b.start||period.end!==r.date||typeof r.member!=='string'||!/^(成员[一二]|member-[a-f0-9]{16})$/.test(r.member)||key!==P.key(r)||(r.month&&period.grain!=='month')||(!r.month&&r.grain!==period.grain))throw Error('历史收入期间或成员无效。');}else if(key!=='assets|'+r.date)throw Error('历史资产日期无效。');}
function monthEnd(m){return new Date(Date.UTC(+m.slice(0,4),+m.slice(5),0)).toISOString().slice(0,10);}
function openHistory(file,{profiles=()=>[],state=()=>({incomes:[],snapshots:[]}),periods=()=>[],today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date())}={}){
 const db=new DatabaseSync(file);ensureSchema(db);const previews=new Map();
 const list=()=>db.prepare('SELECT key,payload FROM history_records ORDER BY key').all().map(x=>({key:x.key,...JSON.parse(x.payload)}));
 function assertNoIncomeOverlap(records){const old=list().filter(r=>r.kind==='income');for(const r of records)if(r.type==='income'&&old.some(h=>h.member===r.member&&P.overlaps(h,r)))throw Error('该成员在这段期间已有历史收入汇总，请先更正历史汇总，不能再叠加逐笔收入。');}
 function prepare(input){
  if(!input||!['income','assets'].includes(input.kind))throw Error('请选择导入内容。');const table=parseTable(input.text),header=table.shift(),general=input.kind==='income'&&header[0]==='期间',expected=input.kind==='income'?(general?['期间','成员','收入金额','备注']:['月份','成员一收入','成员二收入','备注']):['日期','家庭总资产','备注'];
  if(header.length!==expected.length||header.some((v,i)=>v!==expected[i]))throw Error('表头需为：'+expected.join('，')+'。请下载模板，或从Excel按相同列顺序粘贴。');
  const members=input.members||[],known=profiles().map(p=>p.key),base=state(),old=new Map(list().map(r=>[r.key,r])),seen=new Set(),rows=[];
  for(let i=0;i<table.length;i++){try{const cells=table[i];if(cells.length!==expected.length)throw Error('列数不正确，请保留备注列；CSV中金额含逗号时需加双引号。');const memo=cells.at(-1);if(memo.length>200)throw Error('备注不能超过200字。');const period=input.kind==='income'?P.parse(cells[0]):null,date=period?.end||dateText(cells[0]);if(period&&!general&&period.grain!=='month')throw Error('两人快捷表的月份需为YYYY-MM，其他期间请用通用表。');if(date>today()||(!general&&input.kind==='income'&&period.start.slice(0,7)>=today().slice(0,7)))throw Error('请填写已结束的收入期间，日期不能晚于今天。');if(periods().some(p=>P.overlaps({start:period?.start||date,date},{start:p.month+'-01',date:monthEnd(p.month)})))throw Error('这段期间包含已正式关账月份，修改前请先重新打开。');
    const incomeRow=(member,cents)=>({kind:'income',...(period.grain==='month'?{month:period.start.slice(0,7)}:{start:period.start,period:period.label,grain:period.grain}),date,member,cents,memo});
    let values;if(input.kind==='assets')values=[{kind:'assets',date,cents:amount(cells[1]),memo}];else if(general){const matches=profiles().filter(p=>p.key===cells[1]||p.name===cells[1]);if(matches.length!==1)throw Error('成员名称不存在或重名，请在设置中核对，或使用成员编号。');values=[incomeRow(matches[0].key,amount(cells[2]))];}else values=[1,2].filter(n=>cells[n]!=='').map(n=>{const member=members[n-1];if(!known.includes(member)||members[0]===members[1])throw Error('请为两列分别选择不同的现有家庭成员。');return incomeRow(member,amount(cells[n]));});
    if(!values.length)throw Error('请至少填写一位成员的收入；没有收入请填0。');
    for(const r of values){const key=r.kind==='income'?P.key(r):'assets|'+r.date;if(seen.has(key))throw Error('本次表格存在重复期间/成员或日期。');seen.add(key);
     if(r.kind==='income'&&base.incomes.some(x=>x.member===r.member&&P.overlaps(r,x)))throw Error('该成员在这段期间已有逐笔收入，不能再导入重叠汇总，避免重复统计。');
     if(r.kind==='income'&&[...old.values(),...rows].some(x=>x.kind==='income'&&x.key!==key&&x.member===r.member&&P.overlaps(r,x)))throw Error('该成员的收入期间重叠，不能同时加入年度、月度或日期明细；请使用互不重叠的汇总。');
     if(r.kind==='assets'&&base.snapshots.some(x=>x.complete&&x.date===r.date))throw Error('该日期已有可计算的账户资产记录，请修改日期或使用账户盘点。');
     const previous=old.get(key); // 比较时剔除存储键。
     const existing=previous?Object.fromEntries(Object.entries(previous).filter(([k])=>k!=='key')):null;
     const action=!previous?'新增':hash(existing)===hash(r)?'跳过重复':input.replace===true?'更新':'冲突';rows.push({key,...r,action,line:i+2});
    }
   }catch(e){throw Error('第'+(i+2)+'行：'+e.message);}}
  const proposed=new Map(old);for(const {key,action,line,...r}of rows)if(action==='新增'||action==='更新')proposed.set(key,r);safe([...proposed.values()].filter(r=>r.kind==='income').reduce((s,r)=>s+BigInt(r.cents),base.incomes.reduce((s,r)=>s+BigInt(r.cents),0n)));
  const summary={add:rows.filter(r=>r.action==='新增').length,update:rows.filter(r=>r.action==='更新').length,skip:rows.filter(r=>r.action==='跳过重复').length,conflict:rows.filter(r=>r.action==='冲突').length};return{rows,summary};
 }
 function currentDigest(){return hash({rows:list(),state:state(),periods:periods(),profiles:profiles()});}
 function preview(input,userId){for(const [key,p]of previews)if(p.expires<Date.now())previews.delete(key);if(previews.size>=20)throw Error('待确认预览较多，请稍后重试。');const result=prepare(input),token=randomBytes(24).toString('hex');previews.set(token,{input:structuredClone(input),userId,digest:currentDigest(),expires:Date.now()+600000});return{token,...result};}
 function commit(token,userId){const p=previews.get(token);if(!p||p.userId!==userId||p.expires<Date.now())throw Error('导入预览已过期，请重新检查。');if(p.done)return{...p.result,alreadySaved:true};db.exec('BEGIN IMMEDIATE');try{if(currentDigest()!==p.digest)throw Error('预览后账本已变化，请重新检查后导入。');const r=prepare(p.input);if(r.summary.conflict)throw Error('有冲突记录，请勾选更新并重新预览。');const save=db.prepare('INSERT INTO history_records VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload');for(const {key,action,line,...row}of r.rows)if(action==='新增'||action==='更新')save.run(key,JSON.stringify(row));db.exec('COMMIT');p.done=true;p.result=r.summary;return r.summary;}catch(e){db.exec('ROLLBACK');throw e;}}
 return{list,preview,commit,assertNoIncomeOverlap,invalidate:()=>previews.clear(),close:()=>db.close()};
}
module.exports={openHistory,ensureSchema,validateStored,parseTable};
