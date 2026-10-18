const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-http-v2-')),server=spawn(process.execPath,['server.cjs'],{cwd:__dirname,env:{...process.env,PORT:'4320',FAMILY_DATA_DIR:dir,FAMILY_FX_DISABLE:'1'},stdio:['ignore','pipe','pipe']});let cookie='';
async function request(route,body,headers={}){const res=await fetch('http://127.0.0.1:4320'+route,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers}});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return{status:res.status,body:await res.json(),setCookie:res.headers.get('set-cookie')};}
async function preview(records){const p=await request('/api/import/preview',{data:{format:'family-assets-import',version:2,batchId:randomUUID(),records}});assert.equal(p.status,200,JSON.stringify(p.body));return p.body;}
async function save(records){const p=await preview(records);const c=await request('/api/import/commit',{kind:p.kind,prepared:p.prepared,signature:p.signature});assert.equal(c.status,200,JSON.stringify(c.body));return c;}
(async()=>{try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('服务退出 '+c)));});
 assert.equal((await request('/api/state')).status,401);assert.equal((await request('/api/backups/export')).status,401);
 const loginPage=await fetch('http://127.0.0.1:4320/login');assert.equal(loginPage.status,200);assert((await loginPage.text()).includes('href="/modern.css"'));
 const publicTheme=await fetch('http://127.0.0.1:4320/modern.css',{redirect:'manual'});assert.equal(publicTheme.status,200);assert.match(publicTheme.headers.get('content-type'),/text\/css/);assert((await publicTheme.text()).includes('body.auth-body'));
 const init=await request('/api/auth/setup',{admin:{username:'testone',name:'我',password:'1',confirmPassword:'1'}});assert.equal(init.status,200);assert.equal(init.body.user.role,'admin');assert(init.body.recoveryCode);
 assert.equal((await request('/api/state')).body.accounts.length,0);assert.equal((await request('/api/members')).body.members.length,1);
 const m=await request('/api/members/add',{username:'testtwo',name:'家人',password:'2',confirmPassword:'2'});assert.equal(m.status,200);
 const third=await request('/api/members/add',{username:'testthree',name:'第三人',password:'',confirmPassword:''});assert.equal(third.status,200);
 const a=(await request('/api/accounts',{name:'工资卡',owner:init.body.user.member,type:'银行卡',currency:'CNY',date:'2026-08-31',amount:'100'})).body.account;
 assert(a.id);assert.equal((await request('/api/accounts',{name:'不允许跨站',owner:init.body.user.member,type:'银行卡',currency:'CNY',date:'2026-08-31',amount:'1'},{Origin:'https://evil.example'})).status,403);
 await save([{type:'income',date:'2026-09-15',member:m.body.member.member,source:'工资',account:a.id,amount:'50'}]);
 const monthly={requestId:randomUUID(),expectedRevision:0,month:'2026-09',through:'2026-09-30',amount:'20'};assert.equal((await request('/api/expenses/month',monthly)).status,200);
 assert.equal((await request('/api/periods/review?month=2026-09')).body.canClose,false);
 await save([{type:'balance',date:'2026-09-30',account:a.id,amount:'130'}]);
 const stale=await preview([{type:'income',date:'2026-09-20',member:third.body.member.member,source:'待确认',account:a.id,amount:'1'}]);
 const review=(await request('/api/periods/review?month=2026-09')).body;assert(review.canClose);assert.equal(review.summary.netCents,3000);
 assert.equal((await request('/api/periods/close',{month:'2026-09',digest:review.digest,incomeConfirmed:false})).status,400);
 assert.equal((await request('/api/periods/close',{month:'2026-09',digest:review.digest,incomeConfirmed:true})).status,200);
 assert.equal((await request('/api/import/commit',{kind:stale.kind,prepared:stale.prepared,signature:stale.signature})).status,400);
 assert.equal((await request('/api/expenses/month',{...monthly,requestId:randomUUID(),expectedRevision:1,amount:'30'})).status,400);
 assert.equal((await request('/api/accounts',{name:'回填历史',owner:init.body.user.member,type:'银行卡',currency:'CNY',date:'2026-08-01',amount:'1'})).status,400);
 const backup=(await request('/api/backups/export')).body;assert.equal(backup.version,5);assert.equal(backup.tables.monthly_periods.length,1);assert(!backup.tables.auth_users&&!backup.tables.auth_recovery);
 const bp=await request('/api/backups/preview',{backup});assert.equal(bp.status,200,JSON.stringify(bp.body));const restored=await request('/api/backups/restore',{token:bp.body.token,password:'1',acknowledge:true});assert.equal(restored.status,200,JSON.stringify(restored.body));assert.equal((await request('/api/state')).body.periods.length,1);
 assert.equal((await request('/api/maintenance/preview',{action:'delete-account',id:a.id})).status,400);const adminCookie=cookie;await request('/api/auth/logout',{});assert.equal((await request('/api/auth/login',{username:'testtwo',password:'2'})).status,200);
 assert.equal((await request('/api/maintenance')).status,403);assert.equal((await request('/api/maintenance/preview',{action:'delete-account',id:a.id})).status,403);assert.equal((await request('/api/maintenance/commit',{token:'invalid'})).status,403);assert.equal((await request('/api/members')).status,403);assert.equal((await request('/api/periods/reopen',{month:'2026-09'})).status,403);assert.equal((await request('/api/members/reset-password',{id:init.body.user.id,newPassword:'x',confirmPassword:'x'})).status,403);assert.equal((await request('/api/backups/restore',{token:bp.body.token,password:'2',acknowledge:true})).status,403);
 await request('/api/auth/logout',{});await request('/api/auth/login',{username:'testone',password:'1'});assert.equal((await request('/api/periods/reopen',{month:'2026-09'})).status,200);await save([{type:'income',date:'2026-09-20',member:third.body.member.member,source:'第三成员工资',account:a.id,amount:'1'}]);
 assert.equal((await request('/api/members/remove',{id:third.body.member.id})).status,200);const state=(await request('/api/state')).body;assert(state.incomes.some(r=>r.member===third.body.member.member));assert(state.memberProfiles.some(p=>p.key===third.body.member.member&&!p.active));
 for(const script of ['maintenance-ui.js','workflow-ui.js','session-ui.js','backup-ui.js'])assert.equal((await fetch('http://127.0.0.1:4320/'+script,{headers:{Cookie:cookie}})).status,200);
 await request('/api/auth/logout',{});const recovered=await request('/api/auth/recover',{username:'testone',code:init.body.recoveryCode,newPassword:'3',confirmPassword:'3'});assert.equal(recovered.status,200);assert(recovered.body.recoveryCode);assert.equal((await request('/api/auth/login',{username:'testone',password:'3'})).status,200);
 console.log('接口测试通过：管理员首次设置、资金账户、三位成员、月度填报关账、历史锁定与重开、角色权限、恢复含关账备份、网页登录找回密码。');
}finally{server.kill();await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));if(path.dirname(dir)===os.tmpdir())fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
