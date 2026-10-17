const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {scaled,safe,validDate}=require('./money.cjs');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function openExpenses(filename,{memberKeys=()=>['成员一','成员二'],requiredMemberKeys=memberKeys}={}){
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS expense_months(member TEXT NOT NULL,month TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(member,month));
    CREATE TABLE IF NOT EXISTS expense_commands(id TEXT PRIMARY KEY,digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS expense_audit(id INTEGER PRIMARY KEY,before_json TEXT,after_json TEXT NOT NULL,at TEXT NOT NULL);`);
  const list=()=>db.prepare('SELECT payload FROM expense_months ORDER BY month,member').all().map(r=>JSON.parse(r.payload));
  function save(input){
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
    if(!input||!validDate(input.month+'-01')||input.month>today.slice(0,7))throw Error('请选择有效月份。');
    if(input.member!==undefined&&input.member!=='共同'||input.mode!==undefined&&input.mode!=='total')throw Error('请使用家庭月总额，或一次填写各成员月总额。');
    input={...input,member:'共同',mode:'total'};
    if(typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw Error('保存凭据无效，请刷新后重试。');
    if(input.memo!==undefined&&(typeof input.memo!=='string'||input.memo.length>200))throw Error('备注不能超过200字。');
    let cents=null,through=null;
    if(input.mode==='total'){
      if(input.breakdown!==undefined){
        const required=requiredMemberKeys(),allowed=memberKeys();
        if(!Array.isArray(input.breakdown)||!input.breakdown.length||input.breakdown.length>100)throw Error('请分别填写成员月度支出。');
        const seen=new Set();
        input.breakdown=input.breakdown.map(r=>{if(!r||typeof r.member!=='string'||seen.has(r.member)||!allowed.includes(r.member)||typeof r.amount!=='string')throw Error('支出成员无效或重复。');seen.add(r.member);const negative=r.amount.startsWith('-'),cents=safe(scaled(negative?r.amount.slice(1):r.amount))*(negative?-1:1);return{member:r.member,cents};});
        if(required.some(k=>!seen.has(k)))throw Error('请填齐每位成员的月总额，没有支出请填0。');
        const total=safe(input.breakdown.reduce((s,r)=>s+BigInt(r.cents),0n));input.amount=(total/100).toFixed(2);
      }
      if(typeof input.amount!=='string')throw Error('请填写月度支出总额，确认没有支出时可填0。');
      const negative=input.amount.startsWith('-');cents=safe(scaled(negative?input.amount.slice(1):input.amount))*(negative?-1:1);
      through=input.through;
      if(!validDate(through)||through.slice(0,7)!==input.month||through>today)throw Error('请选择该月内、不晚于今天的汇总截止日。');
    }
    db.exec('BEGIN IMMEDIATE');
    try{
      const command=db.prepare('SELECT digest FROM expense_commands WHERE id=?').get(input.requestId),hash=digest(input);
      if(command){if(command.digest!==hash)throw Error('请求编号已被其他内容使用。');db.exec('COMMIT');return{alreadySaved:true};}
      const before=db.prepare('SELECT payload FROM expense_months WHERE member=? AND month=?').get(input.member,input.month);
      const prior=before?JSON.parse(before.payload):null;
      if((prior?.revision||0)!==input.expectedRevision)throw Error('这份月度支出已被更新，请刷新后核对，避免覆盖其他人的修改。');
      const row={scope:'household',member:'共同',month:input.month,mode:'total',cents,through,memo:(input.memo||'').trim(),revision:(prior?.revision||0)+1,updatedAt:new Date().toISOString()};
      if(input.breakdown)row.breakdown=input.breakdown;
      db.prepare('INSERT INTO expense_months VALUES(?,?,?) ON CONFLICT(member,month) DO UPDATE SET payload=excluded.payload').run(row.member,row.month,JSON.stringify(row));
      db.prepare('INSERT INTO expense_commands VALUES(?,?)').run(input.requestId,hash);
      db.prepare('INSERT INTO expense_audit(before_json,after_json,at) VALUES(?,?,?)').run(prior?JSON.stringify(prior):null,JSON.stringify(row),row.updatedAt);
      db.exec('COMMIT');return{summary:row};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  return{list,save,close:()=>db.close()};
}
module.exports={openExpenses};
