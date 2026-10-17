const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');
const {openLedger}=require('./ledger.cjs'),{openPortfolio}=require('./portfolio.cjs'),{openExpenses}=require('./expenses.cjs'),{openAuth}=require('./auth.cjs'),{openBackups}=require('./backup.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'family-backup-test-')),opened=[];
function app(name){const dir=path.join(root,name);fs.mkdirSync(dir);const file=path.join(dir,'family.sqlite'),a={dir,auth:openAuth(file),expenses:openExpenses(file),portfolio:openPortfolio(file),ledger:openLedger(file)};a.backups=openBackups(file);opened.push(a);return a;}
const resign=b=>{const {checksum,...body}=b;b.checksum=createHash('sha256').update(JSON.stringify(body)).digest('hex');return b;};
(async()=>{try{
 const a=app('source'),b=app('target');
 const users=[{username:'testingone',password:'test-password-1234',confirmPassword:'test-password-1234'},{username:'testingtwo',password:'test-password-5678',confirmPassword:'test-password-5678'}];
 const auth=await b.auth.setup({admin:users[0]});
 const data={format:'family-assets-import',version:1,currency:'CNY',batchId:'backup-test-001',records:[{type:'balance',date:'2026-01-01',account:'a',amount:'10000.00'},{type:'income',date:'2026-01-02',member:'成员一',source:'工资',account:'a',amount:'2000.00'}]};const p=a.ledger.preview(data);a.ledger.commit(data,p.digest);
 a.expenses.save({month:'2026-01',amount:'1000.00',through:'2026-01-31',requestId:'backup-month-001',expectedRevision:0});
 const hp=a.portfolio.preview({format:'family-assets-portfolio',version:1,batchId:'backup-portfolio-001',records:[{date:'2026-01-01',asset:{id:'usd-test',name:'美元测试',owner:'成员一',kind:'cash',currency:'USD',origin:'other'},amount:'10.00',fx:{rate:'7',date:'2026-01-01',source:'测试'}}]});a.portfolio.commit(hp.prepared,hp.signature);
 const backup=a.backups.exportBackup();assert(!Object.keys(backup.tables).some(k=>k.startsWith('auth_')));
 const before=b.backups.exportBackup(),preview=b.backups.preview(backup,auth.user.id);assert.equal(preview.summary.records,2);assert.deepEqual(b.backups.exportBackup().tables,before.tables);
 assert.throws(()=>b.backups.restore(preview.token,'wrong-user'));
 await assert.rejects(()=>b.auth.reauthenticate(auth.user,'incorrect',auth.token,'local'));
 await b.auth.reauthenticate(auth.user,users[0].password,auth.token,'local');
 const result=b.backups.restore(preview.token,auth.user.id);assert(result.restored);assert(b.auth.session(auth.token));assert.deepEqual({...b.backups.exportBackup().tables,member_profiles:[]},{...backup.tables,member_profiles:[]});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(b.dir,'backups',result.safetyBackup),'utf8')).tables,JSON.parse(JSON.stringify(before.tables)));assert(b.backups.restore(preview.token,auth.user.id).alreadyRestored);
 const corrupt=structuredClone(backup);corrupt.tables.records[0].payload='{}';assert.throws(()=>b.backups.preview(corrupt,auth.user.id),/校验/);assert.throws(()=>b.backups.preview(resign(corrupt),auth.user.id));
 const injected=structuredClone(backup);injected.tables.auth_users=[];assert.throws(()=>b.backups.preview(resign(injected),auth.user.id));
 const stale=b.backups.preview(backup,auth.user.id);b.expenses.save({month:'2026-02',amount:'5',through:'2026-02-28',requestId:'backup-month-002',expectedRevision:0});assert.throws(()=>b.backups.restore(stale.token,auth.user.id),/已变化/);assert.equal(b.expenses.list().length,2);
 b.backups.automatic();b.backups.automatic();assert.equal(fs.readdirSync(path.join(b.dir,'backups')).filter(n=>n.startsWith('daily-')).length,1);
 const c=app('failed-safety');const cBefore=c.backups.exportBackup(),cp=c.backups.preview(backup,'tester');fs.writeFileSync(path.join(c.dir,'backups'),'占用备份目录');assert.throws(()=>c.backups.restore(cp.token,'tester'));assert.deepEqual(c.backups.exportBackup().tables,cBefore.tables);
 const invalid=structuredClone(backup);invalid.tables.portfolio_values[0].payload=invalid.tables.portfolio_values[0].payload.replace('"cnyCents":7000','"cnyCents":7001');assert.throws(()=>a.backups.preview(resign(invalid),'tester'));
 const draftInput={...data,batchId:'draft-before-restore',records:[{type:'income',date:'2026-01-03',account:'a',member:'成员一',source:'测试草稿',amount:'1'}],version:2};const draft=a.ledger.preview(draftInput);a.ledger.invalidateDrafts();assert.throws(()=>a.ledger.commitPrepared(draft.prepared,draft.signature));
 console.log('备份测试通过：完整恢复、保留登录、安全副本、错误文件拒绝、预览不写入、并发覆盖保护、每日备份。');
}finally{for(const a of opened)for(const key of ['backups','ledger','portfolio','expenses','auth'])a[key].close();if(path.dirname(root)===os.tmpdir())fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
