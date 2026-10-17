const {DatabaseSync}=require('node:sqlite');
const {createHash,createHmac,randomBytes,timingSafeEqual}=require('node:crypto');
const owners=['成员一','成员二','共同'];
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function validDate(s){try{return typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}catch{return false;}}
function scaled(value,places=6){
  if(typeof value!=='string'||!new RegExp('^(0|[1-9]\\d{0,10})(\\.\\d{1,'+places+'})?$').test(value))throw Error('金额、数量或价格格式无效，请使用非负数字文本。');
  const [a,b='']=value.split('.');return BigInt(a)*10n**BigInt(places)+BigInt(b.padEnd(places,'0'));
}
const rounded=(n,d)=>(n+d/2n)/d;
function safe(n){const v=Number(n);if(!Number.isSafeInteger(v))throw Error('金额超出安全计算范围。');return v;}
function openPortfolio(filename,{quote=()=>null,today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()),reservedAccountIds=()=>[],cashBalanceExists=()=>false,memberKeys=()=>['成员一','成员二']}={}){
  const db=new DatabaseSync(filename);let secret=randomBytes(32);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS portfolio_batches(id TEXT PRIMARY KEY,input_digest TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS portfolio_values(id INTEGER PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES portfolio_batches(id),asset_id TEXT NOT NULL,date TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(asset_id,date));`);
  const sign=x=>createHmac('sha256',secret).update(JSON.stringify(x)).digest('hex');
  const list=()=>db.prepare('SELECT v.payload,v.batch_id,b.created_at FROM portfolio_values v JOIN portfolio_batches b ON b.id=v.batch_id ORDER BY v.date,v.id').all().map(x=>{const r=JSON.parse(x.payload),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(x.created_at));return{...r,batchKey:'portfolio-'+x.batch_id,...(r.date===day?{projectionTime:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(x.created_at))}:{})};});
  function preview(input){
    if(!input||input.format!=='family-assets-portfolio'||input.version!==1||typeof input.batchId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.batchId)||!Array.isArray(input.records)||!input.records.length||input.records.length>100)throw Error('需要有效的持仓导入格式，每批1–100条。');
    const inputDigest=digest(input),prior=db.prepare('SELECT * FROM portfolio_batches WHERE id=?').get(input.batchId);
    if(prior){if(prior.input_digest!==inputDigest)throw Error('批次编号已用于其他内容。');const prepared=JSON.parse(prior.payload);return{prepared,signature:sign(prepared),alreadyImported:true,warnings:['此批次已保存，再次确认不会重复录入。']};}
    const existing=list(),byId=new Map(existing.map(x=>[x.asset.id,x.asset])),keys=new Set(),warnings=[];
    const rows=input.records.map(r=>{
      if(!r||!validDate(r.date)||r.date>today())throw Error('估值日期无效，不能使用未来日期。');
      const a=r.asset;
      if(!a||typeof a.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>80||![...memberKeys(),'共同'].includes(a.owner)||!['cash','stock','rsu'].includes(a.kind)||!['purchase','rsu','espp','other'].includes(a.origin)||typeof a.currency!=='string'||!/^[A-Z]{3}$/.test(a.currency))throw Error('请完整填写持仓编号、名称、归属、种类、币种与来源。');
      if(['a','b','c','d','__proto__','constructor','prototype'].includes(a.id))throw Error('此持仓编号已被保留，请使用其他编号。');
      if(reservedAccountIds().includes(a.id))throw Error('持仓编号与资金账户冲突。');
      const asset={id:a.id,name:a.name.trim(),owner:a.owner,kind:a.kind,currency:a.currency,origin:a.origin};
      if(asset.kind==='rsu'&&asset.origin!=='rsu')throw Error('待归属RSU的来源必须选择RSU。');
      if(a.kind!=='cash'){if(typeof a.symbol!=='string'||!a.symbol.trim()||a.symbol.length>40)throw Error('股票需要填写市场和代码，如 NASDAQ:DEMO。');asset.symbol=a.symbol.trim();}
      if(byId.has(asset.id)&&digest(byId.get(asset.id))!==digest(asset))throw Error('同一持仓的名称、归属、币种和类型须保持一致。若为不同持仓，请使用新编号。');
      if([...byId.values()].some(old=>old.id!==asset.id&&old.name===asset.name&&old.owner===asset.owner&&old.kind===asset.kind&&old.currency===asset.currency&&old.origin===asset.origin&&old.symbol===asset.symbol))throw Error('已有相同名称和归属的持仓，请选择原有持仓更新；不同机构或批次请在名称中明确区分。');
      byId.set(asset.id,asset);
      const key=asset.id+':'+r.date;if(keys.has(key)||existing.some(x=>x.asset.id===asset.id&&x.date===r.date))throw Error('同一持仓同一天已有估值，本次不覆盖；更正入口尚未接入。');keys.add(key);
      if(asset.kind==='cash'&&cashBalanceExists(asset.id,r.date))throw Error('此现金账户同日已有账本盘点，请勿重复覆盖。');
      let nativeCents,quantity=null,price=null;
      if(asset.kind==='cash')nativeCents=safe(scaled(r.amount,2));
      else{quantity=r.quantity;price=r.price;nativeCents=safe(rounded(scaled(quantity)*scaled(price),10000000000n));if(!validDate(r.priceDate)||r.priceDate>r.date)throw Error('请填写不晚于估值日期的股价日期。');if(r.priceDate<r.date)warnings.push('部分股票沿用较早价格，请核对价格日期；没有自动行情。');}
      let fx;
      if(asset.currency==='CNY')fx={rate:'1',date:r.date,source:'人民币本币'};
      else if(r.fx){
        if(typeof r.fx.source!=='string'||!r.fx.source.trim()||r.fx.source.length>100||!validDate(r.fx.date)||r.fx.date>r.date||scaled(r.fx.rate,10)===0n)throw Error('手动汇率须为正数，填写不晚于估值日的日期及来源。');
        fx={rate:r.fx.rate,date:r.fx.date,source:r.fx.source.trim()};warnings.push('含手动确认汇率，请核对来源和日期。');
      }else{
        const q=quote();if(!q||!q.toCny?.[asset.currency])throw Error('暂无此币种自动汇率，请更新汇率或填写手动参考值。');
        if(q.rateDate>r.date)throw Error('自动汇率晚于历史估值日，不能用今日汇率回填。请填写对应日期的手动参考汇率。');
        fx={rate:q.toCny[asset.currency].toFixed(10),date:q.rateDate,source:q.source,fetchedAt:q.fetchedAt};
      }
      if(Date.parse(r.date)-Date.parse(fx.date)>5*86400000)warnings.push('部分汇率距估值日超过5天，保存前请核对。');
      const cnyCents=safe(rounded(BigInt(nativeCents)*scaled(fx.rate,10),10000000000n));
      const row={asset,date:r.date,nativeCents,cnyCents,fx};
      if(asset.kind!=='cash')Object.assign(row,{quantity,price,priceDate:r.priceDate});
      if(asset.kind==='rsu'&&r.vestDate){if(!validDate(r.vestDate))throw Error('预计归属日期无效。');row.vestDate=r.vestDate;}
      if(r.memo!==undefined&&(typeof r.memo!=='string'||r.memo.length>200))throw Error('备注不能超过200字。');
      row.memo=r.memo||'';return row;
    });
    if(rows.some(r=>r.asset.kind==='rsu'))warnings.push('待归属RSU为参考权益，不计入主要家庭资产。');
    if(rows.some(r=>r.asset.origin==='espp'))warnings.push('ESPP仅记录已到账股票；不记录待购资金，也不自动新增工资收入。');
    warnings.push('请确认未将券商账户总资产与其现金、股票明细重复录入。新增持仓范围也会影响资产曲线，不代表全部是投资收益。');
    const prepared={batchId:input.batchId,inputDigest,rows};return{prepared,signature:sign(prepared),alreadyImported:false,warnings:[...new Set(warnings)]};
  }
  function commit(prepared,signature){
    if(!prepared||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(prepared),'hex')))throw Error('草稿校验失败或服务已重启，请重新预览。');
    db.exec('BEGIN IMMEDIATE');
    try{
      const prior=db.prepare('SELECT input_digest FROM portfolio_batches WHERE id=?').get(prepared.batchId);
      if(prior){if(prior.input_digest!==prepared.inputDigest)throw Error('批次已被其他内容使用。');db.exec('COMMIT');return{alreadyImported:true,count:0};}
      const assets=new Map(list().map(x=>[x.asset.id,x.asset]));
      for(const row of prepared.rows){
        if(reservedAccountIds().includes(row.asset.id)||row.asset.kind==='cash'&&cashBalanceExists(row.asset.id,row.date))throw Error('账户或盘点记录已变化，请重新预览。');
        if(assets.has(row.asset.id)&&digest(assets.get(row.asset.id))!==digest(row.asset))throw Error('持仓资料已变化，请重新预览。');
        if([...assets.values()].some(old=>old.id!==row.asset.id&&old.name===row.asset.name&&old.owner===row.asset.owner&&old.kind===row.asset.kind&&old.currency===row.asset.currency&&old.origin===row.asset.origin&&old.symbol===row.asset.symbol))throw Error('已有相同持仓，请重新选择原编号后预览。');
        assets.set(row.asset.id,row.asset);
      }
      db.prepare('INSERT INTO portfolio_batches VALUES(?,?,?,?)').run(prepared.batchId,prepared.inputDigest,JSON.stringify(prepared),new Date().toISOString());
      const insert=db.prepare('INSERT INTO portfolio_values(batch_id,asset_id,date,payload) VALUES(?,?,?,?)');
      for(const row of prepared.rows)insert.run(prepared.batchId,row.asset.id,row.date,JSON.stringify(row));
      db.exec('COMMIT');return{alreadyImported:false,count:prepared.rows.length};
    }catch(e){db.exec('ROLLBACK');throw Error(e.message.includes('UNIQUE')?'已有同日估值，请重新核对后预览。':e.message);}
  }
  return{preview,commit,records:list,invalidateDrafts:()=>{secret=randomBytes(32);},close:()=>db.close()};
}
function combineState(base,records){
  const sorted=records.slice().sort((a,b)=>a.date.localeCompare(b.date)),latest=new Map(sorted.map(r=>[r.asset.id,r]));
  const held=[...latest.values()].filter(r=>r.asset.kind!=='rsu'),pending=[...latest.values()].filter(r=>r.asset.kind==='rsu');
  const extras=held.filter(r=>!base.accounts.some(a=>a.id===r.asset.id)).map(r=>({id:r.asset.id,name:r.asset.name,owner:r.asset.owner,type:r.asset.kind==='cash'?'外币余额':'股票',currency:r.asset.currency,portfolio:true}));
  const dates=[...new Set([...base.snapshots.map(s=>s.date),...sorted.filter(r=>r.asset.kind!=='rsu').map(r=>r.date)])].sort();
  const snapshots=dates.map(date=>{
    const b=base.snapshots.filter(s=>s.date<=date).at(-1),amounts=b?b.amounts.slice():base.accounts.map(()=>null),confirmed=b?{...b.confirmed}:{};
    for(const extra of extras){const v=sorted.filter(r=>r.asset.id===extra.id&&r.date<=date).at(-1);amounts.push(v?v.cnyCents:0);confirmed[extra.id]=v?.date||null;}
    const complete=amounts.every(x=>x!==null);
    if(complete&&!Number.isSafeInteger(amounts.reduce((a,b)=>a+b,0)))throw Error('家庭资产合计超出计算范围。');
    return{date,amounts,confirmed,complete,kind:complete&&b?.kind==='confirmed'&&Object.values(confirmed).every(d=>d===date)?'confirmed':'estimated'};
  });
  const displayHeld=held.map(r=>{const b=base.balances.find(a=>a.id===r.asset.id);return b?{...r,date:b.lastEventDate||r.date,nativeCents:b.nativeCents,cnyCents:b.cents,fx:b.fx||r.fx}:r;});
  return{...base,accounts:[...base.accounts,...extras],balances:[...base.balances,...held.filter(r=>extras.some(a=>a.id===r.asset.id)).map(r=>({...extras.find(a=>a.id===r.asset.id),cents:r.cnyCents,confirmedDate:r.date,nativeCents:r.nativeCents,fx:r.fx}))],snapshots,portfolio:{records:sorted,held:displayHeld,pending,pendingCnyCents:pending.reduce((s,r)=>s+r.cnyCents,0)},legacyAccounts:base.accounts,registeredAccounts:base.accounts.filter(a=>!a.portfolioCash&&!a.portfolioLegacy)};
}
module.exports={openPortfolio,combineState};
