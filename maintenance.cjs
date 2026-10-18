const {DatabaseSync}=require('node:sqlite');
const {randomBytes,createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const schema='CREATE TABLE IF NOT EXISTS record_trash(id TEXT PRIMARY KEY,payload TEXT NOT NULL);';
function openMaintenance(file,{ledger,periods,history,profiles,backup,state}={}){
 const db=new DatabaseSync(file);db.exec(schema);const previews=new Map();
 const all=t=>db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
 const read=(t,key,value)=>db.prepare(`SELECT * FROM ${t} WHERE ${key}=?`).get(value);
 const tables=()=>Object.fromEntries(Object.keys(require('./backup.cjs').COLUMNS).map(t=>[t,all(t)]));
 const digest=()=>hash(tables());
 const raw=r=>JSON.parse(r.payload);
 const list=()=>all('record_trash').map(r=>({id:r.id,...raw(r)})).filter(r=>!r.restoredAt);
 function dates(rows){return rows.flatMap(r=>r.kind==='income'?[require('./prototype/history-period.js').bounds(r).start,r.date]:[r.date||r.month+'-01']);}
 function writable(rows){periods.assertWritable(dates(rows));}
 function refreshBatches(){for(const b of all('batches')){const rows=db.prepare('SELECT payload FROM records WHERE batch_id=? ORDER BY id').all(b.id).map(raw);db.prepare('UPDATE batches SET digest=? WHERE id=?').run(hash(rows),b.id);}}
 function insert(t,row){const keys=Object.keys(require('./backup.cjs').COLUMNS).includes(t)?require('./backup.cjs').COLUMNS[t]:null;if(!keys)throw Error('恢复内容无效。');db.prepare(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}
 function rowKey(t,r){return t==='history_records'?['key',r.key]:t==='expense_months'?null:['id',r.id];}
 function remove(t,r){if(t==='expense_months')db.prepare('DELETE FROM expense_months WHERE member=? AND month=?').run(r.member,r.month);else{const [key,value]=rowKey(t,r);db.prepare(`DELETE FROM ${t} WHERE ${key}=?`).run(value);}}
 function projectedState(){const base=ledger.state(),accounts=[...all('ledger_accounts').map(raw),...base.accounts.filter(a=>a.portfolioLegacy)],batches=new Map(all('batches').map(b=>[b.id,b]));const rows=all('records').map(row=>{const r=raw(row),created=batches.get(row.batch_id).created_at,date=new Date(created),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(date);return{...r,order:row.id,batchKey:row.batch_id,...(day===r.date?{projectionTime:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date)}:{})};});return require('./ledger.cjs').project([...rows,...base.records.filter(r=>r.portfolioValuation)],accounts);}
 function validate(){require('./backup.cjs').business(tables());const s=projectedState();if(s.balances.some(b=>b.archivedAt&&b.nativeCents!==0))throw Error('修改后会使归档账户出现非零余额，请先恢复使用该账户。');}
 function editRecord(row,input){
  const r=raw(row);if(!['income','transfer','balance','opening'].includes(r.type))throw Error('这类旧版记录请删除后重新填写。');
  const allowed=['date','amount','memo','member','source','category','account','target','targetAmount','fee'];for(const k of Object.keys(input||{}))if(!allowed.includes(k))throw Error('修改字段无效。');
  const source={...r,amount:(r.cents/100).toFixed(2),fee:((r.feeCents||0)/100).toFixed(2),...(r.targetCents!==undefined?{targetAmount:(r.targetCents/100).toFixed(2)}:{}),...input,type:r.type==='opening'?'balance':r.type};
  const original=ledger.registeredAccounts().find(a=>a.id===r.account);if(source.account!==r.account||r.type==='transfer'&&source.target!==r.target)throw Error('更换账户请删除原记录后重新录入。');
  if(r.type==='opening'&&source.date!==original.startDate)throw Error('初始余额日期与账户纳入日期一致，不能在这里修改。');
  if(r.currency!=='CNY'&&source.date!==r.date)throw Error('外币记录更改日期需要重新确认汇率，请删除后重新录入。');
  if(source.amount!==(r.cents/100).toFixed(2)){delete source.quantity;delete source.price;delete source.symbol;}
  let quote=null;if(r.type==='balance'&&r.fx?.policy==='latest'){source.fxPolicy='latest';quote={rateDate:r.fx.date,source:r.fx.source,fetchedAt:r.fx.fetchedAt,toCny:{[r.currency]:Number(r.fx.rate)}};}
  const normalized=require('./ledger.cjs').normalize({format:'family-assets-import',version:r.currency?2:1,currency:'CNY',batchId:'edit-record',records:[source]},ledger.registeredAccounts(),quote,profiles().map(p=>p.key)).rows[0];
  if(r.type==='opening')normalized.type='opening';return normalized;
 }
 function apply(input,user,preview=false){
  const packs=[],action=input.action;let label='',affected=[];
  if(action==='hide-snapshot'){
   if(list().some(r=>r.action==='hide-snapshot'&&r.snapshotDate===input.id))throw Error('这一天已从资产历史中移除。');
   const snapshot=(state?state().snapshots:ledger.state().snapshots).find(s=>s.date===input.id)||history.list().filter(r=>r.kind==='assets').map(r=>({date:r.date,amounts:[r.cents]})).find(s=>s.date===input.id);if(!snapshot)throw Error('资产历史记录不存在，请刷新。');
   label=input.id+' 资产历史展示点';affected=[{date:input.id,cents:snapshot.amounts.every(Number.isSafeInteger)?snapshot.amounts.reduce((a,b)=>a+b,0):null,memo:'仅从历史列表和首页资产曲线移除，账户、流水及统计金额保留。'}];
   if(!preview){const entry={action,label,affected,packs:[],snapshotDate:input.id,deletedAt:new Date().toISOString(),deletedBy:user.id};db.prepare('INSERT INTO record_trash VALUES(?,?)').run(randomBytes(16).toString('hex'),JSON.stringify(entry));}return{label,count:1,affected};
  }
  if(action==='restore'){const saved=read('record_trash','id',input.id);if(saved){const entry=raw(saved);if(entry.action==='hide-snapshot'){if(entry.restoredAt)throw Error('这项已经恢复，请刷新。');entry.restoredAt=new Date().toISOString();db.prepare('UPDATE record_trash SET payload=? WHERE id=?').run(JSON.stringify(entry),input.id);return{label:entry.label,count:1,affected:entry.affected};}}}

  if(['delete-record','edit-record'].includes(action)){
   const row=read('records','id',input.id);if(!row)throw Error('记录不存在，请刷新。');const r=raw(row);writable([r]);label={income:'收入',transfer:'转账',balance:'余额盘点',opening:'初始余额'}[r.type]||'记录';
   if(action==='delete-record'&&r.type==='opening')throw Error('初始余额不能单独删除；可以编辑金额，或删除整个账户。');
   if(action==='edit-record'){const next=editRecord(row,input.values);writable([next]);history.assertNoIncomeOverlap(next.type==='income'?[next]:[]);db.prepare('UPDATE records SET payload=?,fingerprint=? WHERE id=?').run(JSON.stringify(next),hash(next),row.id);if(!preview)db.prepare('INSERT INTO account_audit(account_id,before_json,after_json,at) VALUES(?,?,?,?)').run(r.account,JSON.stringify({recordId:row.id,...r}),JSON.stringify({recordId:row.id,...next}),new Date().toISOString());}else packs.push({table:'records',row});affected=[r];
  }else if(['delete-history','edit-history'].includes(action)){
   const row=read('history_records','key',input.id);if(!row)throw Error('历史记录不存在。');const r=raw(row);writable([r]);label='历史'+(r.kind==='income'?'收入':'家庭总资产');affected=[r];
   if(action==='edit-history'){if(typeof input.values?.amount!=='string'||!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(input.values.amount))throw Error('金额需为非负数字，最多两位小数。');const next={...r,cents:require('./money.cjs').safe(require('./money.cjs').scaled(input.values.amount)),memo:input.values.memo??r.memo};require('./history.cjs').validateStored(next,row.key);db.prepare('UPDATE history_records SET payload=? WHERE key=?').run(JSON.stringify(next),row.key);if(!preview)db.prepare('INSERT INTO activity_log(user_id,action,at) VALUES(?,?,?)').run(user.id,JSON.stringify({type:'history/edit',key:row.key,before:r,after:next}),new Date().toISOString());}else packs.push({table:'history_records',row});
  }else if(action==='delete-expense'){
   const rows=db.prepare('SELECT * FROM expense_months WHERE month=? ORDER BY member').all(input.id);if(!rows.length)throw Error('月度支出不存在。');affected=rows.map(raw);writable(affected);label=input.id+' 月度支出';packs.push(...rows.map(row=>({table:'expense_months',row})));
  }else if(['delete-account','archive-account','unarchive-account'].includes(action)){
   const row=read('ledger_accounts','id',input.id);if(!row)throw Error('账户不存在，旧持仓账户暂不支持此操作。');const a=raw(row);label=a.name;
   const related=all('records').filter(x=>{const r=raw(x);return r.account===a.id||r.target===a.id;});affected=related.map(raw);
   if(action==='delete-account'){writable(affected.length?affected:[{date:a.startDate}]);packs.push(...related.map(row=>({table:'records',row})),{table:'ledger_accounts',row});}
   else {const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());periods.assertWritable([today]);if(action==='archive-account'){const b=ledger.state().balances.find(b=>b.id===a.id);if(b?.nativeCents!==0)throw Error('请先转出资金，并将实际余额 / 市值核对为0，再归档，避免资产凭空减少。');a.archivedAt=today;}else delete a.archivedAt;db.prepare('UPDATE ledger_accounts SET payload=? WHERE id=?').run(JSON.stringify(a),a.id);if(!preview)db.prepare('INSERT INTO account_audit(account_id,before_json,after_json,at) VALUES(?,?,?,?)').run(a.id,row.payload,JSON.stringify(a),new Date().toISOString());}
  }else if(action==='restore'){
   const saved=read('record_trash','id',input.id);if(!saved)throw Error('回收站记录不存在。');const entry=raw(saved);if(entry.restoredAt)throw Error('这项已经恢复，请刷新。');label=entry.label;affected=entry.affected||[];writable(entry.packs.map(p=>p.table==='ledger_accounts'?{date:raw(p.row).startDate}:raw(p.row)));
   for(const p of [...entry.packs].sort((a,b)=>(a.table==='ledger_accounts'?-1:0)-(b.table==='ledger_accounts'?-1:0))){try{insert(p.table,p.row);}catch{throw Error('原位置已有记录，不能覆盖恢复。请先核对现有记录。');}}
   const restored=entry.packs.filter(p=>p.table==='records').map(p=>raw(p.row));history.assertNoIncomeOverlap(restored);for(const r of restored)for(const id of [r.account,r.target].filter(Boolean)){const a=ledger.registeredAccounts().find(a=>a.id===id);if(a?.archivedAt)throw Error('请先恢复使用关联账户，再恢复记录。');}
   entry.restoredAt=new Date().toISOString();db.prepare('UPDATE record_trash SET payload=? WHERE id=?').run(JSON.stringify(entry),input.id);
  }else throw Error('不支持的操作。');
  if(packs.length){for(const p of packs)remove(p.table,p.row);if(!preview){const entry={action,label,affected,packs,deletedAt:new Date().toISOString(),deletedBy:user.id};db.prepare('INSERT INTO record_trash VALUES(?,?)').run(randomBytes(16).toString('hex'),JSON.stringify(entry));}}
  refreshBatches();validate();return{label,count:packs.length,affected};
 }
 function totals(){return projectedState().balances.map(b=>({id:b.id,name:b.name,currency:b.currency,nativeCents:b.nativeCents,cents:b.cents}));}
 function preview(input,user){for(const [k,v]of previews)if(v.expires<Date.now())previews.delete(k);if(previews.size>=20)throw Error('待确认操作过多，请稍后再试。');const stamp=digest(),before=totals();db.exec('BEGIN IMMEDIATE');let result,after;try{result=apply(input,user,true);after=totals();}finally{db.exec('ROLLBACK');}const token=randomBytes(24).toString('hex');const impact=[...new Set([...before,...after].map(b=>b.id))].map(id=>({before:before.find(b=>b.id===id)||null,after:after.find(b=>b.id===id)||null})).filter(p=>JSON.stringify(p.before)!==JSON.stringify(p.after));const out={token,label:result.label,count:result.count,impact,details:result.affected.map(r=>({date:r.date||r.month,member:r.member,account:r.account,cents:r.cents,currency:r.currency||'CNY',memo:r.source||r.memo||''})),note:(input.action==='hide-snapshot'||result.label.endsWith('资产历史展示点'))?'仅移除这一天的历史展示点，不删除账户、流水和统计金额，可在资产回收站恢复。':'余额会按剩余记录重新计算；后续实际盘点仍有效，所以当前余额不一定按原金额直接加减。历史收入和月度支出只更新统计，不改银行卡余额。'};previews.set(token,{input:structuredClone(input),user:user.id,stamp,expires:Date.now()+600000});return out;}
 function commit(token,user){const p=previews.get(token);if(!p||p.user!==user.id||p.expires<Date.now())throw Error('操作预览已过期，请重新检查。');if(p.done)return{alreadySaved:true};if(digest()!==p.stamp)throw Error('账本已变化，请重新预览。');let safetyBackup;if(p.input.action==='delete-account')safetyBackup=backup();db.exec('BEGIN IMMEDIATE');try{if(digest()!==p.stamp)throw Error('账本已变化，请重新预览。');apply(p.input,user);db.exec('COMMIT');p.done=true;ledger.invalidateDrafts();history.invalidate();return{saved:true,safetyBackup};}catch(e){db.exec('ROLLBACK');throw e;}}
 return{list,hiddenSnapshotDates:()=>list().filter(r=>r.action==='hide-snapshot').map(r=>r.snapshotDate),preview,commit,close:()=>db.close()};
}
module.exports={openMaintenance,schema};
