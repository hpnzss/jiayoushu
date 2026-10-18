const {DatabaseSync}=require('node:sqlite');
const {createHash,createHmac,randomBytes,timingSafeEqual}=require('node:crypto');
const {scaled,safe,convert,validDate,resolveFx,resolveLatestFx}=require('./money.cjs');
const {ACCOUNT_TYPES,INCOME_CATEGORIES,normalizeType}=require('./asset-types.cjs');
const members=['成员一','成员二'];
const defaults=require('./prototype/report.js').accounts.map(a=>({...a,currency:'CNY',startDate:'2000-01-01'}));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fingerprint=r=>hash([r.type,r.date,r.time||null,r.account,r.cents,r.target||null,r.target?(r.targetCents??r.cents):null,r.feeCents||0,r.member||null,r.source||null,r.memo||'',...(r.type==='expense'?[r.category,r.refund,r.affectsBalance]:[])]);
function amount(value,zero=false){const n=safe(scaled(value));if(!zero&&!n)throw Error('收入和转账金额必须大于零。');return n;}
function position(row,input){
  if(input.quantity===undefined&&input.price===undefined)return;
  const cents=safe((scaled(input.quantity,6)*scaled(input.price,6)+5000000000n)/10000000000n);
  if(cents!==row.cents)throw Error('数量乘单价与填写的原币总价值不一致，请核对。');
  Object.assign(row,{quantity:input.quantity,price:input.price});
  if(input.symbol!==undefined){if(typeof input.symbol!=='string'||input.symbol.length>60)throw Error('代码不能超过60字。');row.symbol=input.symbol.trim();}
}
function normalize(input,accounts=defaults,quote=null,memberKeys=members){
  if(!input||input.format!=='family-assets-import'||![1,2].includes(input.version)||(input.version===1&&input.currency!=='CNY'))throw Error('需要 family-assets-import 第1或第2版数据。');
  if(typeof input.batchId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.batchId))throw Error('批次编号无效。');
  if(!Array.isArray(input.records)||!input.records.length||input.records.length>100)throw Error('每批需要1–100条记录。');
  const byId=new Map(accounts.map(a=>[a.id,a])),keys=new Set();
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  const rows=input.records.map((r,i)=>{
    if(r?.type==='expense')throw Error('本软件只记录收入、转账和资产，不支持支出录入。');
    if(!r||!['income','transfer','balance'].includes(r.type)||!validDate(r.date))throw Error(`第${i+1}条类型或日期无效。`);
    if(r.date>today)throw Error('实际账本不能记录未来日期，请在实际发生后录入。');
    const a=byId.get(r.account);if(!a)throw Error('账户不存在，请从当前账户清单选择。');if(a.archivedAt)throw Error('账户已归档，请先恢复使用。');
    if(r.type!=='income'&&r.date<a.startDate)throw Error('记录日期早于账户纳入账本的日期。');
    if(input.version===1&&a.currency!=='CNY')throw Error('外币账户需要第2版导入格式。');
    const row={type:r.type,date:r.date,account:r.account,cents:amount(r.amount,r.type==='balance')};
    if(r.fxPolicy!==undefined&&(r.fxPolicy!=='latest'||r.type!=='balance'))throw Error('最新汇率折算仅用于余额或估值核对。');
    if(r.correction!==undefined){if(r.type!=='balance'||r.correction!==true)throw Error('仅余额核对可以更正。');row.correction=true;}
    if(r.time!==undefined){if(typeof r.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(r.time))throw Error('发生时间需要HH:mm或HH:mm:ss。');row.time=r.time.length===5?r.time+':00':r.time;}
    if(r.type==='income'){
      if(!memberKeys.includes(r.member))throw Error('请从现有成员中选择收入归属。');
      if(typeof r.source!=='string'||!r.source.trim()||r.source.length>80)throw Error('请填写收入来源（不超过80字）。');
      row.member=r.member;row.source=r.source.trim();
      if(r.category!==undefined){if(!INCOME_CATEGORIES.includes(r.category))throw Error('请选择有效收入分类。');row.category=r.category;}
    }

    if(input.version===2){row.currency=a.currency;row.fx=r.fxPolicy==='latest'&&a.currency!=='CNY'?resolveLatestFx(a.currency,quote):resolveFx(a.currency,r.date,r.fx,quote);if(r.type==='income')row.cnyCents=convert(row.cents,row.fx.rate);}
    if(r.type==='transfer'){
      const b=byId.get(r.target);if(!b||b.id===a.id)throw Error('转入账户无效或与转出账户相同。');if(b.archivedAt)throw Error('转入账户已归档，请先恢复使用。');
      if(r.date<b.startDate)throw Error('转账日期早于转入账户纳入日期。');
      if(input.version===1&&b.currency!=='CNY')throw Error('跨币种转账需要第2版格式。');
      row.target=r.target;row.feeCents=r.fee===undefined?0:amount(r.fee,true);
      if(input.version===2){
        row.targetCurrency=b.currency;
        if(a.currency!==b.currency&&r.targetAmount===undefined)throw Error('跨币种转账必须填写转入账户实际到账金额。');
        row.targetCents=r.targetAmount===undefined?row.cents:amount(r.targetAmount);
        if(a.currency===b.currency&&row.targetCents!==row.cents)throw Error('同币种转账的本金与到账金额须相同，手续费单独填写。');
        row.targetFx=a.currency===b.currency?row.fx:resolveFx(b.currency,r.date,r.targetFx,quote);
      }
    }
    if(r.type==='balance'){const key=r.account+':'+r.date+':'+(row.time||'23:59:59');if(keys.has(key))throw Error('同账户同一时点只能确认一个余额。');keys.add(key);}
    if(r.type==='balance')position(row,r);
    if(r.memo!==undefined&&(typeof r.memo!=='string'||r.memo.length>200))throw Error('备注不能超过200字。');
    row.memo=(r.memo||'').trim();return row;
  });return{batchId:input.batchId,rows};
}
function project(rows,accounts=defaults){
  const priority=type=>type==='opening'?-1:type==='balance'?1:0;
  const eventTime=r=>r.type==='opening'?'00:00:00':r.time||r.projectionTime||'23:59:59';
  const sorted=rows.slice().sort((a,b)=>a.date.localeCompare(b.date)||eventTime(a).localeCompare(eventTime(b))||(!a.time&&!a.projectionTime&&!b.time&&!b.projectionTime?priority(a.type)-priority(b.type):a.batchKey&&b.batchKey&&a.batchKey!==b.batchKey?a.order-b.order:priority(a.type)-priority(b.type))||a.order-b.order);
  const values=Object.fromEntries(accounts.map(a=>[a.id,null])),confirmed=Object.fromEntries(accounts.map(a=>[a.id,null])),rates={},updated={};
  const snapshots=[],adjustments=[],finalAt={};
  // Pre-opening income belongs in income history, but is already covered by
  // the authoritative opening balance. It must not create asset snapshots.
  const starts=new Map(accounts.map(a=>[a.id,a.startDate]));
  const events=sorted.filter(e=>e.type!=='expense'&&(e.type!=='income'||e.date>=starts.get(e.account)));
  const revalue=()=>accounts.map(a=>values[a.id]===null?null:a.currency==='CNY'?values[a.id]:rates[a.id]?convert(values[a.id],rates[a.id].rate):null);
  for(let i=0;i<events.length;i++){
    const e=events[i];
    function change(id,n,fx){if(values[id]!==null)values[id]=safe(BigInt(values[id])+BigInt(n));if(fx)rates[id]=fx;updated[id]=e.date;finalAt[id]=null;}
    if(e.type==='income')change(e.account,e.cents,e.fx);
    if(e.type==='transfer'){change(e.account,-e.cents-e.feeCents,e.fx);change(e.target,e.targetCents??e.cents,e.targetFx);}
    if(e.type==='balance'||e.type==='opening'){adjustments.push({date:e.date,account:e.account,cents:values[e.account]===null?null:e.cents-values[e.account],currency:accounts.find(a=>a.id===e.account)?.currency||'CNY'});values[e.account]=e.cents;confirmed[e.account]=e.date;finalAt[e.account]=e.type==='balance'?e.date:null;if(e.fx)rates[e.account]=e.fx;updated[e.account]=e.date;}
    if(i===events.length-1||events[i+1].date!==e.date){
      const amounts=revalue().map((v,j)=>e.date<accounts[j].startDate?0:v),complete=amounts.every(v=>v!==null);
      if(complete)safe(amounts.reduce((s,v)=>s+BigInt(v),0n));
      snapshots.push({date:e.date,amounts,confirmed:{...confirmed},complete,kind:complete&&accounts.every(a=>a.startDate>e.date||finalAt[a.id]===e.date)?'confirmed':'estimated'});
    }
  }
  const cny=revalue();
  return{accounts,members,incomes:sorted.filter(e=>e.type==='income').map(e=>({...e,...(e.currency&&e.currency!=='CNY'?{nativeCents:e.cents,cents:e.cnyCents}:{} )})),snapshots,records:sorted,adjustments,balances:accounts.map((a,i)=>({...a,cents:cny[i],nativeCents:values[a.id],confirmedDate:confirmed[a.id],lastEventDate:updated[a.id]||null,fx:rates[a.id]||null}))};
}
function openLedger(filename,{quote=()=>null,portfolioRecords=()=>[],memberKeys=()=>members,seedDefaults=true}={}){
  const db=new DatabaseSync(filename);let secret=randomBytes(32);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec('CREATE TABLE IF NOT EXISTS record_trash(id TEXT PRIMARY KEY,payload TEXT NOT NULL);');
  db.exec(`CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,digest TEXT NOT NULL,created_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES batches(id),fingerprint TEXT NOT NULL,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS ledger_accounts(id TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS batch_inputs(id TEXT PRIMARY KEY,digest TEXT NOT NULL);CREATE TABLE IF NOT EXISTS account_audit(id INTEGER PRIMARY KEY,account_id TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,at TEXT NOT NULL);`);
  const seed=db.prepare('INSERT OR IGNORE INTO ledger_accounts VALUES(?,?)');if(seedDefaults)for(const a of defaults)seed.run(a.id,JSON.stringify(a));
  if(!seedDefaults){
    const referenced=new Set(db.prepare('SELECT payload FROM records').all().flatMap(r=>{const p=JSON.parse(r.payload);return[p.account,p.target];}));
    for(const a of defaults){const row=db.prepare('SELECT payload FROM ledger_accounts WHERE id=?').get(a.id);if(row&&hash(JSON.parse(row.payload))===hash(a)&&!referenced.has(a.id)&&!db.prepare('SELECT id FROM account_audit WHERE account_id=? LIMIT 1').get(a.id))db.prepare('DELETE FROM ledger_accounts WHERE id=?').run(a.id);}
  }
  const registeredAccounts=()=>db.prepare('SELECT payload FROM ledger_accounts ORDER BY rowid').all().map(x=>{const a=JSON.parse(x.payload);return{...a,type:normalizeType(a.type)};});
  const ownRows=()=>db.prepare('SELECT r.id,r.payload,r.batch_id,b.created_at FROM records r JOIN batches b ON b.id=r.batch_id ORDER BY r.id').all().map(x=>{const r=JSON.parse(x.payload),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(x.created_at));return{...r,order:x.id,batchKey:x.batch_id,...(day===r.date?{projectionTime:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(x.created_at))}:{})};});
  function context(){
    const holdings=portfolioRecords(),cash=holdings.filter(r=>r.asset.kind!=='rsu'),ids=[...new Set(cash.map(r=>r.asset.id))];
    const accounts=[...registeredAccounts(),...ids.map(id=>{const first=cash.find(r=>r.asset.id===id),a=first.asset;return{id,name:a.name,owner:a.owner,type:a.kind==='stock'?'股票':'现金',currency:a.currency,startDate:first.date,portfolioCash:a.kind==='cash',portfolioLegacy:true};})];
    const rows=[...ownRows(),...cash.map((r,i)=>({type:'balance',date:r.date,account:r.asset.id,cents:r.nativeCents,currency:r.asset.currency,fx:r.fx,memo:r.memo||'',...(r.quantity!==undefined?{quantity:r.quantity,price:r.price,symbol:r.asset.symbol}:{}),order:-1000000+i,portfolioValuation:true,projectionTime:r.projectionTime,batchKey:r.batchKey}))];
    return{accounts,rows};
  }
  const sign=x=>createHmac('sha256',secret).update(JSON.stringify(x)).digest('hex');
  function warningsFor(rows,existing,prior){
    const warnings=[],seen=new Set(),fingerprints=new Set(existing.map(({order,portfolioValuation,...r})=>fingerprint(r)));
    for(const r of rows){const fp=fingerprint(r);if(seen.has(fp))throw Error('批次内包含完全相同的重复记录。');seen.add(fp);
      if(fingerprints.has(fp)&&!prior&&!r.correction)warnings.push('已有完全相同的记录，请核对是否重复录入。');
      if(r.type==='balance'&&!r.correction&&existing.some(x=>x.type==='balance'&&x.account===r.account&&x.date===r.date&&(!r.time||(x.time||x.projectionTime||'23:59:59')===r.time))&&!prior)throw Error('已有同一天该账户的余额盘点，请核对；新增不同时间的盘点须填写明确发生时间。');
      for(const fx of [r.fx,r.targetFx])if(fx&&Date.parse(r.date)-Date.parse(fx.date)>5*86400000)warnings.push('部分汇率距发生日超过5天，请核对后确认。');
    }
    if(rows.some(r=>r.type==='balance'))warnings.push('盘点按发生时点校准；历史时间未填时视为日终，发生在盘点之后的流水会继续更新余额。');
    if(rows.some(r=>r.type==='transfer'&&r.currency!==r.targetCurrency))warnings.push('换汇两侧按实际扣款本金和实际到账记录；手续费另加在转出账户。参考折算差额不是新增收入。');
    return[...new Set(warnings)];
  }
  function preview(input){
    const c=context(),prior=input?.batchId?db.prepare('SELECT * FROM batches WHERE id=?').get(input.batchId):null;
    let n;
    if(input?.version===2&&prior){const saved=db.prepare('SELECT digest FROM batch_inputs WHERE id=?').get(input.batchId);if(saved?.digest!==hash(input))throw Error('批次编号已用于其他内容。');n={batchId:input.batchId,rows:db.prepare('SELECT payload FROM records WHERE batch_id=? ORDER BY id').all(input.batchId).map(r=>JSON.parse(r.payload))};}
    else n=normalize(input,c.accounts,quote(),memberKeys());
    const digest=hash(n.rows);if(prior&&prior.digest!==digest)throw Error('此批次编号已用于其他内容。');
    const warnings=warningsFor(n.rows,c.rows,!!prior),result={batchId:n.batchId,digest,rows:n.rows,alreadyImported:!!prior,warnings};
    if(input.version===2){const prepared={batchId:n.batchId,digest,rows:n.rows,inputDigest:hash(input)};Object.assign(result,{kind:'ledger-v2',prepared,signature:sign(prepared)});}
    return result;
  }
  function store(p,ack=false){
    const prior=db.prepare('SELECT digest FROM batches WHERE id=?').get(p.batchId);if(prior){if(prior.digest!==p.digest)throw Error('批次内容不一致。');return{alreadyImported:true,count:0};}
    const c=context(),warnings=warningsFor(p.rows,c.rows,false);
    if(warnings.some(w=>w.startsWith('已有完全相同'))&&!ack)throw Error('疑似重复，请核对后确认仍要保存。');
    const ids=new Set(c.accounts.map(a=>a.id));for(const r of p.rows)if(!ids.has(r.account)||(r.target&&!ids.has(r.target)))throw Error('账户已变化，请重新预览。');
    const max=c.rows.reduce((m,r)=>Math.max(m,r.order),0);project([...c.rows,...p.rows.map((r,i)=>({...r,order:max+i+1}))],c.accounts);
    db.prepare('INSERT INTO batches VALUES(?,?,?)').run(p.batchId,p.digest,new Date().toISOString());
    let nextId=Math.max(db.prepare('SELECT coalesce(max(id),0) n FROM records').get().n,db.prepare("SELECT coalesce(max(CAST(json_extract(j.value,'$.row.id') AS INTEGER)),0) n FROM record_trash t,json_each(t.payload,'$.packs') j WHERE json_extract(j.value,'$.table')='records'").get().n);
    const insert=db.prepare('INSERT INTO records(id,batch_id,fingerprint,payload) VALUES(?,?,?,?)');for(const r of p.rows)insert.run(++nextId,p.batchId,fingerprint(r),JSON.stringify(r));
    if(p.inputDigest)db.prepare('INSERT INTO batch_inputs VALUES(?,?)').run(p.batchId,p.inputDigest);
    return{alreadyImported:false,count:p.rows.length};
  }
  function commit(input,expectedDigest,ack=false){db.exec('BEGIN IMMEDIATE');try{const p=preview(input);if(p.digest!==expectedDigest)throw Error('内容已变化，请重新预览。');const result=store(p.prepared||p,ack);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  function commitPrepared(prepared,signature,ack=false){if(!prepared||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(prepared),'hex')))throw Error('草稿已过期或校验失败，请重新预览。');db.exec('BEGIN IMMEDIATE');try{const result=store(prepared,ack);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  function saveAccount(input){
    if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>80||![...memberKeys(),'共同'].includes(input.owner)||!ACCOUNT_TYPES.includes(normalizeType(input.type)))throw Error('请填写账户名称、归属和类型。');
    input={...input,type:normalizeType(input.type)};
    const before=input.id?registeredAccounts().find(a=>a.id===input.id):null;
    if(input.id&&!before)throw Error('此账户属于持仓估值模块，请在持仓入口更新。');if(before?.archivedAt)throw Error('账户已归档，请先恢复使用。');
    if(before&&input.currency&&input.currency!==before.currency)throw Error('已有账户的币种不能修改，请新建不同币种账户。');
    const account=before?{...before,name:input.name.trim(),owner:input.owner,type:input.type}:{id:randomBytes(12).toString('hex'),name:input.name.trim(),owner:input.owner,type:input.type,currency:input.currency,startDate:input.date};
    for(const key of ['institution','typeDetail'])if(input[key]!==undefined){if(typeof input[key]!=='string'||input[key].length>80)throw Error('自定义名称不能超过80字。');account[key]=input[key].trim();}
    if(input.note!==undefined){if(typeof input.note!=='string'||input.note.length>4000)throw Error('账户备注最多4000字。');account.note=input.note;}
    if(account.type!=='其他')delete account.typeDetail;
    if(!['银行存款/理财','银行存款','网络平台余额','网络平台','银行理财','股票','基金','贵金属','债券','加密货币'].includes(account.type))delete account.institution;
    if(['银行存款/理财','银行存款','网络平台余额','网络平台','银行理财'].includes(account.type)&&!account.institution)throw Error('请选择或填写银行 / 平台名称。');
    if(!before&&(!/^[A-Z]{3}$/.test(account.currency||'')||!validDate(account.startDate)))throw Error('账户币种或纳入日期无效。');
    if(!before&&account.startDate>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()))throw Error('账户纳入日期不能晚于今天。');
    if(registeredAccounts().some(a=>a.id!==account.id&&a.name===account.name&&a.owner===account.owner&&a.currency===account.currency))throw Error('已有同名同归属同币种账户，请更换名称或编辑已有账户。');
    let opening;
    if(!before){const cents=amount(input.amount,true),fx=resolveFx(account.currency,input.date,input.fx,quote());opening={type:'opening',date:input.date,account:account.id,cents,currency:account.currency,fx,memo:'纳入日流水发生前的初始余额'};position(opening,input);}
    if(before&&input.updateValue===true){
      if(!validDate(input.date)||input.date<account.startDate||input.date>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()))throw Error('请选择不早于纳入日、不晚于今天的估值日期。');
      opening={type:'balance',date:input.date,account:account.id,cents:amount(input.amount,true),currency:account.currency,fx:resolveFx(account.currency,input.date,input.fx,quote()),memo:'统一账户余额 / 估值更新'};
      if(input.time!==undefined){if(!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(input.time))throw Error('估值时间无效。');opening.time=input.time;}
      position(opening,input);
    }
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare('INSERT INTO ledger_accounts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(account.id,JSON.stringify(account));
      if(input.requestId!==undefined&&!/^[A-Za-z0-9_-]{8,70}$/.test(input.requestId))throw Error('保存编号无效，请重新提交。');
      if(opening){const batchId=before?'valuation-'+(input.requestId||randomBytes(12).toString('hex')):'account-'+account.id;store({batchId,digest:hash([opening]),rows:[opening]});}
      db.prepare('INSERT INTO account_audit(account_id,before_json,after_json,at) VALUES(?,?,?,?)').run(account.id,before?JSON.stringify(before):null,JSON.stringify(account),new Date().toISOString());
      db.exec('COMMIT');return account;
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  return{preview,commit,commitPrepared,saveAccount,registeredAccounts,ownRows,state:()=>{const c=context();return project(c.rows,c.accounts);},invalidateDrafts:()=>{secret=randomBytes(32);},close:()=>db.close()};
}
module.exports={normalize,project,openLedger};
