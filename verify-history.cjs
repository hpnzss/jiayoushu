const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-history-http-')),server=spawn(process.execPath,['server.cjs'],{cwd:__dirname,env:{...process.env,HOST:'127.0.0.1',PORT:'4330',FAMILY_DATA_DIR:dir,FAMILY_FX_DISABLE:'1'},stdio:['ignore','pipe','pipe']});let cookie='';
async function call(route,body){const r=await fetch('http://127.0.0.1:4330'+route,{headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,body:await r.json()};}
async function importRows(body){const p=await call('/api/history/preview',body);assert.equal(p.status,200,JSON.stringify(p.body));assert.equal(p.body.summary.conflict,0);const c=await call('/api/history/commit',{token:p.body.token});assert.equal(c.status,200,JSON.stringify(c.body));return{p:p.body,c:c.body};}
(async()=>{try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});assert.equal((await call('/api/history/preview',{kind:'income'})).status,401);
 const admin=(await call('/api/auth/setup',{admin:{username:'historytest',name:'甲',password:'1',confirmPassword:'1'}})).body.user;
 const other=(await call('/api/members/add',{username:'historyother',name:'乙',password:'2',confirmPassword:'2'})).body.member;
 const members=[admin.member,other.member],income={kind:'income',members,text:'\uFEFF月份,成员一收入,成员二收入,备注\r\n2018-01,"1,200.50",800,"合成,例子"\r\n2018-02,0,,未知不是零'};
 const previewOnly=await call('/api/history/preview',income);assert.equal(previewOnly.status,200);assert.equal((await call('/api/state')).body.history.length,0);
 const first=await importRows(income);assert.equal(first.c.add,3);assert((await call('/api/history/commit',{token:first.p.token})).body.alreadySaved);
 let state=(await call('/api/state')).body;assert.equal(state.accounts.length,0);assert.equal(state.incomes.length,0);assert.equal(state.history.length,3);
 const report=require('./prototype/report.js');report.load(state);const summary=report.report('2018-01-01','2018-12-31');assert.equal(summary.income,200050);assert.equal(summary.gap,null);assert.equal(report.report('2018-01-10','2018-01-31').income,0);assert(report.report('2018-01-10','2018-01-31').partialHistory);
 const series=require('./prototype/income-series.js').series(report.reportingIncomes(),members,{grain:'month',start:'2018-01-01',end:'2018-02-28',today:'2026-10-17'});assert.deepEqual(series.lines[0].values,[120050,0]);assert.deepEqual(series.lines[1].values,[80000,null]);assert.deepEqual(series.lines[2].values,[200050,null]);
 assert.equal((await call('/api/history/preview',income)).body.summary.skip,3);
 const changed={...income,text:income.text.replace('1,200.50','1,300.50')};assert.equal((await call('/api/history/preview',changed)).body.summary.conflict,1);const c=await importRows({...changed,replace:true});assert.equal(c.c.update,1);assert.equal((await call('/api/state')).body.history.length,3);
 assert.equal((await call('/api/history/preview',{...income,text:'月份,成员一收入,成员二收入,备注\n2018-03,100,200,a\n2018-03,100,200,b'})).status,400);
 assert.equal((await call('/api/history/preview',{...income,text:'月份,成员一收入,成员二收入,备注\n2099-01,100,200,a'})).status,400);
 assert.equal((await call('/api/history/preview',{...income,members:[members[0],members[0]]})).status,400);
 await importRows({kind:'assets',text:'日期\t家庭总资产\t备注\n2017/12/31\t100000\t合成期初\n2018-12-31\t130000\t合成期末'});
 state=(await call('/api/state')).body;report.load(state);const r=report.report('2018-01-01','2018-12-31');assert.equal(r.delta,3000000);assert.equal(report.total(r.closing),13000000);assert(r.closing.historical);assert.equal(state.snapshots.length,0);
 const account=(await call('/api/accounts',{name:'合成现金',owner:admin.member,type:'现金',currency:'CNY',date:'2018-01-01',amount:'500'})).body.account;
 const duplicateLive={format:'family-assets-import',version:2,batchId:randomUUID(),records:[{type:'income',date:'2018-01-15',member:admin.member,source:'工资',account:account.id,amount:'100'}]};assert.equal((await call('/api/records/save',{data:duplicateLive})).status,400);
 const live={...duplicateLive,batchId:randomUUID(),records:[{...duplicateLive.records[0],date:'2018-03-15'}]};assert.equal((await call('/api/records/save',{data:live})).status,200);
 assert.equal((await call('/api/history/preview',{...income,text:'月份,成员一收入,成员二收入,备注\n2018-03,100,,重叠'})).status,400);assert.equal((await call('/api/state')).body.balances[0].cents,60000);
 const stale=(await call('/api/history/preview',{kind:'assets',text:'日期,家庭总资产,备注\n2019-01-01,140000,合成'})).body;
 await importRows({kind:'assets',text:'日期,家庭总资产,备注\n2019-02-01,150000,合成'});assert.equal((await call('/api/history/commit',{token:stale.token})).status,400);
 await importRows({kind:'income',text:'期间,成员,收入金额,备注\n2010,甲,1000,合成年汇总\n2011-01-01~2011-03-31,乙,300,合成区间'});
 const backup=(await call('/api/backups/export')).body;assert.equal(backup.version,5);assert.equal(backup.tables.history_records.length,8);assert.equal((await call('/api/backups/preview',{backup})).status,200);
 const legacy=structuredClone(backup);legacy.version=2;delete legacy.tables.history_records;delete legacy.tables.record_trash;delete legacy.checksum;legacy.checksum=createHash('sha256').update(JSON.stringify(legacy)).digest('hex');assert.equal((await call('/api/backups/preview',{backup:legacy})).status,200);
 await importRows({kind:'assets',replace:true,text:'日期,家庭总资产,备注\n2019-02-01,1,合成更正'});const restoredPreview=(await call('/api/backups/preview',{backup})).body;assert.equal((await call('/api/backups/restore',{token:restoredPreview.token,password:'1',acknowledge:true})).status,200);assert.equal((await call('/api/state')).body.history.find(r=>r.date==='2019-02-01').cents,15000000);
 assert.equal((await call('/api/expenses/month',{month:'2018-03',through:'2018-03-31',expectedRevision:0,requestId:randomUUID(),breakdown:members.map(member=>({member,amount:'0'}))})).status,200);
 assert.equal((await call('/api/balances/month',{date:'2018-03-31',requestId:randomUUID(),balances:[{account:account.id,amount:'600'}]})).status,200);
 const closing=(await call('/api/periods/review?month=2018-03')).body;assert.equal(closing.summary.incomeCents,10000);assert.equal(closing.summary.assetsCents,60000);assert.equal((await call('/api/periods/close',{month:'2018-03',digest:closing.digest,incomeConfirmed:true})).status,200);
 const closedImport=await call('/api/history/preview',{kind:'assets',text:'日期,家庭总资产,备注\n2018-03-14,140000,已关账'});assert.equal(closedImport.status,400);assert.match(closedImport.body.error,/关账/);
 assert.throws(()=>require('./history.cjs').validateStored({kind:'income',month:'2018-13',date:'2019-01-31',member:admin.member,cents:1,memo:''},'income|2018-13|'+admin.member));
 await call('/api/auth/logout',{});await call('/api/auth/login',{username:'historyother',password:'2'});assert.equal((await call('/api/history/preview',income)).status,403);assert.equal((await call('/api/state')).body.history.length,8);
 console.log('历史导入测试通过：CSV/Excel粘贴、月份成员映射、0与未知、月年曲线、独立资产点、预览不写入、去重与更新、双向收入防重、余额不变、并发预览失效、权限及新旧备份恢复。');
 }finally{server.kill();await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
