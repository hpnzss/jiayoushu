const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,createHash}=require('node:crypto');
const {validDate,scaled,safe,convert}=require('./money.cjs');
const {openLedger}=require('./ledger.cjs');
const {openPortfolio,combineState}=require('./portfolio.cjs');
const {openExpenses}=require('./expenses.cjs');
const {ACCOUNT_TYPES,normalizeType}=require('./asset-types.cjs');
const COLUMNS={
  batches:['id','digest','created_at'],ledger_accounts:['id','payload'],batch_inputs:['id','digest'],records:['id','batch_id','fingerprint','payload'],account_audit:['id','account_id','before_json','after_json','at'],
  portfolio_batches:['id','input_digest','payload','created_at'],portfolio_values:['id','batch_id','asset_id','date','payload'],
  expense_months:['member','month','payload'],expense_commands:['id','digest'],expense_audit:['id','before_json','after_json','at'],activity_log:['id','user_id','action','at'],member_profiles:['key','payload'],monthly_periods:['month','payload'],history_records:['key','payload']
};
COLUMNS.record_trash=['id','payload'];
const TABLES=Object.keys(COLUMNS),MAX_BYTES=16*1024*1024;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function need(ok,message='备份字段或引用关系无效。'){if(!ok)throw Error(message);}
function number(n,negative=false){need(Number.isSafeInteger(n)&&(negative||n>=0),'备份金额无效或超出计算范围。');}
function text(s,max=200){need(typeof s==='string'&&s.length<=max);}
function id(s){need(typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s));}
function validMember(s){return typeof s==='string'&&/^(成员[一二]|member-[a-f0-9]{16}|共同)$/.test(s);}
function fx(x,date,currency,allowLatest=false){const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());need(plain(x)&&validDate(x.date)&&(x.policy==='latest'?allowLatest&&x.date<=today:x.date<=date));need(x.policy===undefined||x.policy==='latest');text(x.source,100);need(scaled(x.rate,10)>0n);if(currency==='CNY')need(scaled(x.rate,10)===10000000000n);}
function business(tables){
  for(const row of tables.record_trash||[]){const p=JSON.parse(row.payload);need(plain(p)&&Array.isArray(p.packs)&&(p.packs.length>0||p.action==='hide-snapshot')&&Array.isArray(p.affected)&&typeof p.label==='string'&&typeof p.deletedBy==='string'&&Number.isFinite(Date.parse(p.deletedAt)));need(['delete-record','delete-history','delete-expense','delete-account','hide-snapshot'].includes(p.action));if(p.action==='hide-snapshot')need(validDate(p.snapshotDate)&&p.packs.length===0&&p.affected.length===1&&p.affected[0].date===p.snapshotDate&&(p.affected[0].cents===null||Number.isSafeInteger(p.affected[0].cents)));for(const item of p.packs){need(plain(item)&&['records','ledger_accounts','history_records','expense_months'].includes(item.table)&&plain(item.row));need(Object.keys(item.row).sort().join(',')===COLUMNS[item.table].slice().sort().join(','));need(typeof item.row.payload==='string'&&plain(JSON.parse(item.row.payload)));}if(p.restoredAt)need(Number.isFinite(Date.parse(p.restoredAt)));}
  for(const row of tables.history_records)require('./history.cjs').validateStored(JSON.parse(row.payload),row.key);
  const P=require('./prototype/history-period.js'),historyGroups=new Map();for(const row of tables.history_records){const r=JSON.parse(row.payload);if(r.kind!=='income')continue;const list=historyGroups.get(r.member)||[];list.push(P.bounds(r));historyGroups.set(r.member,list);}for(const rows of historyGroups.values()){rows.sort((a,b)=>a.start.localeCompare(b.start));for(let i=1;i<rows.length;i++)need(rows[i].start>rows[i-1].end,'历史收入汇总期间重叠。');}
  function hasHistoricalIncome(r){const rows=historyGroups.get(r.member)||[];let low=0,high=rows.length;while(low<high){const mid=(low+high)>>1;if(rows[mid].start<=r.date)low=mid+1;else high=mid;}return low>0&&rows[low-1].end>=r.date;}
  const combinedIncome=[...tables.history_records.map(r=>JSON.parse(r.payload)).filter(r=>r.kind==='income'),...tables.records.map(r=>JSON.parse(r.payload)).filter(r=>r.type==='income')].reduce((sum,r)=>sum+BigInt(r.cnyCents??r.cents),0n);number(Number(combinedIncome));
  for(const row of tables.member_profiles){const p=JSON.parse(row.payload);need(plain(p)&&p.key===row.key&&validMember(p.key)&&p.key!=='共同'&&typeof p.active==='boolean');text(p.name,40);need(p.name.trim());if(p.providentRule!==undefined)require('./provident.cjs').validateRule(p.providentRule);if(p.color!==undefined)need(/^#[0-9a-f]{6}$/i.test(p.color));if(p.gender!==undefined)need(['male','female','unspecified'].includes(p.gender));}
  for(const row of tables.monthly_periods){const p=JSON.parse(row.payload);need(plain(p)&&p.month===row.month&&validDate(p.month+'-01')&&typeof p.closedAt==='string'&&Number.isFinite(Date.parse(p.closedAt))&&typeof p.closedBy==='string'&&plain(p.summary)&&typeof p.digest==='string');for(const key of ['incomeCents','assetsCents','openingCents','deltaCents'])need(Object.hasOwn(p.summary,key));for(const key of ['incomeCents','expenseCents','assetsCents','openingCents','deltaCents','netCents','unexplainedCents'])if(p.summary[key]!==null&&p.summary[key]!==undefined)number(p.summary[key],true);}
  const accounts=new Map();
  for(const row of tables.ledger_accounts){const a=JSON.parse(row.payload);need(plain(a)&&a.id===row.id&&validMember(a.owner)&&/^[A-Z]{3}$/.test(a.currency)&&validDate(a.startDate));id(a.id);text(a.name,80);need(a.name.trim()&&ACCOUNT_TYPES.includes(normalizeType(a.type)));accounts.set(a.id,a);}

  for(const row of tables.ledger_accounts){const a=JSON.parse(row.payload);for(const key of ['institution','typeDetail'])if(a[key]!==undefined)text(a[key],80);if(a.note!==undefined)text(a.note,4000);if(a.archivedAt!==undefined)need(validDate(a.archivedAt)&&a.archivedAt>=a.startDate);}
  const assets=new Map(),portRows=new Map();
  for(const row of tables.portfolio_values){const r=JSON.parse(row.payload),a=r?.asset;need(plain(r)&&plain(a)&&a.id===row.asset_id&&r.date===row.date&&validDate(r.date));id(a.id);need(!accounts.has(a.id)&&['cash','stock','rsu'].includes(a.kind)&&validMember(a.owner)&&['other','purchase','rsu','espp'].includes(a.origin)&&/^[A-Z]{3}$/.test(a.currency));text(a.name,80);need(a.name.trim());
    need(!assets.has(a.id)||hash(assets.get(a.id))===hash(a),'同一持仓资料不一致。');assets.set(a.id,a);number(r.nativeCents);number(r.cnyCents);fx(r.fx,r.date,a.currency);need(convert(r.nativeCents,r.fx.rate)===r.cnyCents,'持仓原币与人民币估值不一致。');
    if(a.kind!=='cash'){text(a.symbol,40);need(a.symbol.trim()&&validDate(r.priceDate)&&r.priceDate<=r.date);need(safe((scaled(r.quantity,6)*scaled(r.price,6)+5000000000n)/10000000000n)===r.nativeCents,'股数、价格与持仓价值不一致。');}
    if(a.kind==='rsu')need(a.origin==='rsu');if(r.vestDate)need(validDate(r.vestDate));if(r.memo!==undefined)text(r.memo);
    const rows=portRows.get(row.batch_id)||[];rows.push(r);portRows.set(row.batch_id,rows);
  }
  const available=new Map([...accounts,...[...assets].filter(([,a])=>a.kind!=='rsu').map(([key,a])=>[key,{...a,startDate:'2000-01-01'}])]);
  const byBatch=new Map();
  for(const row of tables.records){const r=JSON.parse(row.payload);need(plain(r)&&['opening','income','transfer','balance','expense'].includes(r.type)&&validDate(r.date)&&available.has(r.account));number(r.cents);need(r.type==='income'||r.date>=available.get(r.account).startDate);if(r.time!==undefined)need(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(r.time));if(r.memo!==undefined)text(r.memo);
    if(r.quantity!==undefined||r.price!==undefined)need(safe((scaled(r.quantity,6)*scaled(r.price,6)+5000000000n)/10000000000n)===r.cents,'持仓数量、单价与总价值不一致。');
    const currency=available.get(r.account).currency;need(!r.currency||r.currency===currency);if(currency!=='CNY'||r.fx)fx(r.fx,r.date,currency,r.type==='balance');
    if(r.type==='income'){need(validMember(r.member)&&r.member!=='共同'&&r.cents>0);text(r.source,80);need(r.source.trim());need(!hasHistoricalIncome(r),'备份中历史汇总与逐笔收入期间重叠，不能重复统计。');}
    if(r.type==='expense'){need(validMember(r.member)&&r.cents>0);text(r.category,40);need(typeof r.affectsBalance==='boolean'&&typeof r.refund==='boolean');}
    if(r.cnyCents!==undefined){number(r.cnyCents);need(r.cnyCents===convert(r.cents,r.fx?.rate||'1'),'流水原币和折算金额不一致。');}
    if(r.type==='transfer'){need(available.has(r.target)&&r.target!==r.account&&r.cents>0);number(r.feeCents);const target=available.get(r.target);if(r.targetCents!==undefined){number(r.targetCents);need(r.targetCents>0);}if(currency!==target.currency)need(r.targetCents!==undefined);else need(r.targetCents===undefined||r.targetCents===r.cents);if(r.targetFx)fx(r.targetFx,r.date,target.currency);if(target.currency!=='CNY'&&currency!==target.currency)need(r.targetFx);}
    const rows=byBatch.get(row.batch_id)||[];rows.push(r);byBatch.set(row.batch_id,rows);
  }
  for(const b of tables.batches)need(hash(byBatch.get(b.id)||[])===b.digest,'流水批次校验失败，备份可能不完整。');
  for(const b of tables.portfolio_batches){const p=JSON.parse(b.payload);need(plain(p)&&p.batchId===b.id&&p.inputDigest===b.input_digest&&hash(p.rows)===hash(portRows.get(b.id)||[]),'持仓批次校验失败。');}
  for(const row of tables.expense_months){const s=JSON.parse(row.payload);need(plain(s)&&s.member===row.member&&s.month===row.month&&validMember(s.member)&&validDate(s.month+'-01')&&['total','itemized'].includes(s.mode)&&Number.isSafeInteger(s.revision)&&s.revision>0);if(s.mode==='total'){number(s.cents,true);need(validDate(s.through)&&s.through.slice(0,7)===s.month);}if(s.scope==='household')need(s.member==='共同'&&s.mode==='total');text(s.memo);}
  for(const row of tables.expense_months){const s=JSON.parse(row.payload);if(s.breakdown!==undefined){need(Array.isArray(s.breakdown)&&s.breakdown.length>0&&s.breakdown.length<=100);const seen=new Set();let total=0n;for(const b of s.breakdown){need(plain(b)&&validMember(b.member)&&b.member!=='共同'&&!seen.has(b.member));seen.add(b.member);number(b.cents,true);total+=BigInt(b.cents);}need(Number(total)===s.cents,'成员支出与家庭合计不一致。');}}
  for(const table of ['account_audit','expense_audit'])for(const row of tables[table])for(const key of ['before_json','after_json'])if(row[key]!==null)need(plain(JSON.parse(row[key])));
}
function openBackups(filename,{directory=path.join(path.dirname(filename),'backups'),now=()=>Date.now()}={}){
  const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS member_profiles(key TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS monthly_periods(month TEXT PRIMARY KEY,payload TEXT NOT NULL);');
  require('./history.cjs').ensureSchema(db);db.exec('CREATE TABLE IF NOT EXISTS record_trash(id TEXT PRIMARY KEY,payload TEXT NOT NULL);');
  const schema=Object.fromEntries(TABLES.map(name=>{const row=db.prepare('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=?').get(name);need(row,'账本结构不完整，无法备份。');return[name,row.sql];}));
  const previews=new Map();let lastError=null;
  function tables(){return Object.fromEntries(TABLES.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY ${name==='ledger_accounts'?'rowid':COLUMNS[name][0]}`).all()]));}
  function snapshot(){db.exec('BEGIN');try{const data=tables();db.exec('COMMIT');return data;}catch(e){db.exec('ROLLBACK');throw e;}}
  function exportBackup(){const body={format:'family-assets-backup',version:5,createdAt:new Date(now()).toISOString(),tables:snapshot()};return{...body,checksum:hash(body)};}
  const counts=t=>({accounts:t.ledger_accounts.length,records:t.records.length,holdings:t.portfolio_values.length,months:t.expense_months.length,history:t.history_records.length});
  function check(input){
    need(plain(input)&&input.format==='family-assets-backup'&&[1,2,3,4,5].includes(input.version),'请选择新版“完整账本备份”。旧版数据导出和演示文件不能直接恢复。');
    need(typeof input.createdAt==='string'&&Number.isFinite(Date.parse(input.createdAt))&&plain(input.tables));
    need(Object.keys(input).sort().join(',')===['format','version','createdAt','tables','checksum'].sort().join(','));
    const expected=TABLES.filter(n=>!(input.version<5&&n==='record_trash')&&!(input.version===1&&['member_profiles','monthly_periods','history_records'].includes(n))&&!(input.version===2&&n==='history_records'));
    need(Object.keys(input.tables).sort().join(',')===expected.slice().sort().join(','),'备份数据表不完整或包含不允许恢复的内容。');
    const body={format:input.format,version:input.version,createdAt:input.createdAt,tables:input.tables};need(input.checksum===hash(body),'文件完整性校验失败，请重新选择备份。');
    need(Buffer.byteLength(JSON.stringify(input))<=MAX_BYTES,'当前备份文件最多支持16MB。');
    if(input.version===1){input.tables.member_profiles=[];input.tables.monthly_periods=[];}
    if(input.version<3)input.tables.history_records=[];if(input.version<5){input.tables.record_trash=[];input.version=5;input.checksum=hash({format:input.format,version:5,createdAt:input.createdAt,tables:input.tables});}
    for(const name of TABLES){const rows=input.tables[name],columns=COLUMNS[name];need(Array.isArray(rows)&&rows.length<=100000);for(const row of rows){need(plain(row)&&Object.keys(row).sort().join(',')===columns.slice().sort().join(','));for(const key of columns){const v=row[key];if(key==='id'&&name!=='batches'&&name!=='ledger_accounts'&&name!=='batch_inputs'&&name!=='portfolio_batches'&&name!=='expense_commands'&&name!=='record_trash'){number(v);need(v>0);}else if(key==='before_json'&&v===null)continue;else text(v,524288);}}}
    business(input.tables);
    const stagePath=path.join(path.dirname(filename),'.restore-check-'+randomBytes(12).toString('hex')+'.sqlite');
    let stage,ledger,portfolio,expenses;
    try{
      stage=new DatabaseSync(stagePath);stage.exec('PRAGMA foreign_keys=ON;');for(const name of TABLES)stage.exec(schema[name]);insert(stage,input.tables);
      need(stage.prepare('PRAGMA integrity_check').get().integrity_check==='ok'&&stage.prepare('PRAGMA foreign_key_check').all().length===0,'备份数据库结构或引用检查失败。');
      portfolio=openPortfolio(stagePath);ledger=openLedger(stagePath,{seedDefaults:false,portfolioRecords:()=>portfolio.records()});expenses=openExpenses(stagePath);
      const result=combineState(ledger.state(),portfolio.records());for(const point of result.snapshots)if(point.complete)number(point.amounts.reduce((a,b)=>a+b,0),true);
      return{...counts(input.tables),createdAt:input.createdAt,latestRecord:[...result.records.map(r=>r.date),...portfolio.records().map(r=>r.date)].sort().at(-1)||null};
    }finally{
      ledger?.close();portfolio?.close();expenses?.close();stage?.close();
      for(const suffix of ['','-wal','-shm']){const p=stagePath+suffix;if(path.dirname(p)!==path.dirname(filename))throw Error('校验临时文件路径无效。');if(fs.existsSync(p))fs.unlinkSync(p);}
    }
  }
  function insert(connection,data){
    for(const name of TABLES){const columns=COLUMNS[name],statement=connection.prepare(`INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);for(const row of data[name])statement.run(...columns.map(key=>row[key]));}
  }
  function preview(input,userId){
    for(const [key,p]of previews)if(p.expires<=now())previews.delete(key);
    need(previews.size<3,'待确认的恢复文件较多，请等待10分钟后重试。');
    input=JSON.parse(JSON.stringify(input));const summary=check(input),token=randomBytes(32).toString('hex');
    previews.set(token,{input:JSON.parse(JSON.stringify(input)),userId,expires:now()+10*60*1000,currentDigest:hash(snapshot()),summary});
    return{token,summary,warning:'将替换当前账本数据；当前登录账号和密码保持不变，恢复前会自动保存现有账本。'};
  }
  function saveFile(kind,backup=exportBackup()){
    fs.mkdirSync(directory,{recursive:true,mode:0o700});const name=kind+'-'+new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(4).toString('hex')+'.json';
    fs.writeFileSync(path.join(directory,name),JSON.stringify(backup),{flag:'wx',mode:0o600});lastError=null;return name;
  }
  function restore(token,userId){
    const p=previews.get(token);need(p&&p.userId===userId&&p.expires>now(),'恢复预览已过期，请重新选择并检查文件。');
    if(p.done)return{alreadyRestored:true,safetyBackup:p.safetyBackup};
    db.exec('BEGIN IMMEDIATE');let safetyBackup;
    try{
      need(hash(tables())===p.currentDigest,'预览后账本已变化，请重新检查文件，避免覆盖家人的新记录。');
      const body={format:'family-assets-backup',version:5,createdAt:new Date(now()).toISOString(),tables:tables()};
      safetyBackup=saveFile('before-restore',{...body,checksum:hash(body)});
      const currentProfiles=db.prepare('SELECT * FROM member_profiles').all();
      for(const name of TABLES.slice().reverse())db.exec(`DELETE FROM ${name}`);insert(db,p.input.tables);
      for(const row of currentProfiles)db.prepare('INSERT OR IGNORE INTO member_profiles VALUES(?,?)').run(row.key,row.payload);
      need(db.prepare('PRAGMA foreign_key_check').all().length===0,'恢复引用检查失败，已保留原数据。');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    p.done=true;p.safetyBackup=safetyBackup;p.input=null;return{restored:true,safetyBackup};
  }
  function status(){
    let names=[];try{names=fs.readdirSync(directory).filter(n=>/^(daily|before-restore|before-change)-.*\.json$/.test(n)).sort();}catch(e){if(e.code!=='ENOENT')lastError='无法读取备份目录，请检查目录权限。';}
    return{count:names.length,lastAutomatic:names.filter(n=>n.startsWith('daily-')).at(-1)||null,lastSafetyBackup:names.filter(n=>n.startsWith('before-restore-')).at(-1)||null,lastError};
  }
  function automatic(){
    try{const day=new Date(now()).toISOString().slice(0,10);if(status().lastAutomatic?.startsWith('daily-'+day))return;saveFile('daily');}
    catch{lastError='自动备份失败，请检查数据目录权限和磁盘空间。';}
  }
  return{exportBackup,preview,restore,status,automatic,safety:()=>saveFile('before-change'),close:()=>db.close()};
}
module.exports={openBackups,MAX_BYTES,COLUMNS,business};
