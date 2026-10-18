const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {openLedger}=require('./ledger.cjs');
const {createFxService}=require('./fx.cjs');
const {openPortfolio,combineState}=require('./portfolio.cjs');
const {openExpenses}=require('./expenses.cjs');
const {openAuth}=require('./auth.cjs');
const {openBackups,MAX_BYTES}=require('./backup.cjs');
const config=require('./runtime.cjs').runtime();
const dir=process.env.FAMILY_DATA_DIR||path.join(__dirname,'data');
const previewMode=!!process.env.FAMILY_PREVIEW_PASSWORD;
if(previewMode&&(config.host!=='127.0.0.1'||path.resolve(dir)!==path.join(__dirname,'.preview-data')||!fs.existsSync(path.join(dir,'PREVIEW_ONLY'))))throw Error('预览仅允许使用本机隔离的虚拟账本。');
fs.mkdirSync(dir,{recursive:true});
const fx=createFxService(dir);
const expenses=openExpenses(path.join(dir,'family.sqlite'),{memberKeys:()=>auth.profiles().map(p=>p.key),requiredMemberKeys:()=>auth.profiles().filter(p=>p.active).map(p=>p.key)});
const auth=openAuth(path.join(dir,'family.sqlite'));
const memberKeys=()=>auth.profiles().map(p=>p.key);
let ledger;
const portfolio=openPortfolio(path.join(dir,'family.sqlite'),{memberKeys,quote:()=>fx.state().quote,reservedAccountIds:()=>ledger?ledger.registeredAccounts().map(a=>a.id):[],cashBalanceExists:(id,date)=>ledger?ledger.ownRows().some(r=>r.type==='balance'&&r.account===id&&r.date===date):false});
ledger=openLedger(path.join(dir,'family.sqlite'),{memberKeys,seedDefaults:false,quote:()=>fx.state().quote,portfolioRecords:()=>portfolio.records()});
const financialState=()=>({...combineState(ledger.state(),portfolio.records()),expenseSummaries:expenses.list()});
const periods=require('./periods.cjs').openPeriods(path.join(dir,'family.sqlite'),{state:financialState});
const history=require('./history.cjs').openHistory(path.join(dir,'family.sqlite'),{profiles:()=>auth.profiles(),state:financialState,periods:()=>periods.list()});
const backups=openBackups(path.join(dir,'family.sqlite'));
const maintenance=require('./maintenance.cjs').openMaintenance(path.join(dir,'family.sqlite'),{ledger,periods,history,profiles:()=>auth.profiles(),backup:()=>backups.safety(),state:financialState});
const provident=require('./provident.cjs').openProvident(path.join(dir,'family.sqlite'),{ledger,auth,periods,history});provident.runDue();setInterval(()=>provident.runDue(),60*60*1000).unref();
backups.automatic();setInterval(()=>backups.automatic(),6*60*60*1000).unref();
if(process.env.FAMILY_FX_DISABLE!=='1'){
  fx.refresh();
  setInterval(()=>fx.refresh(),6*60*60*1000).unref();
}
const {port,host}=config;
const files={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/report.js':['report.js','text/javascript'],'/ui.js':['ui.js','text/javascript'],'/expenses-report.js':['expenses-report.js','text/javascript'],'/expenses-ui.js':['expenses-ui.js','text/javascript'],'/style.css':['style.css','text/css']};
Object.assign(files,{'/login':['login.html','text/html'],'/auth.js':['auth.js','text/javascript'],'/session-ui.js':['session-ui.js','text/javascript']});
files['/backup-ui.js']=['backup-ui.js','text/javascript'];
files['/workflow-ui.js']=['workflow-ui.js','text/javascript'];files['/monthly-ui.js']=['monthly-ui.js','text/javascript'];
files['/client-common.js']=['client-common.js','text/javascript'];files['/direct-ui.js']=['direct-ui.js','text/javascript'];
files['/choices-ui.js']=['choices-ui.js','text/javascript'];files['/modern.css']=['modern.css','text/css'];files['/mobile.css']=['mobile.css','text/css'];
for(const name of ['date-controls.js','chart-labels.js','provident-ui.js','table-sort.js','asset-distribution.js','inline-actions.js','expense-composition.js','account-catalog.js','chart-axis.js','income-composition.js','mobile-shell.js','asset-navigation.js','income-charts.js','income-options.js','maintenance-ui.js','income-series.js','dashboard-ui.js','modern-ui.js','history-ui.js','history-period.js'])files['/'+name]=[name,'text/javascript'];
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
const cookieName=previewMode?'family_preview_session':'family_session';
function readToken(req){return(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
function setCookie(res,token,origin){res.setHeader('Set-Cookie',`${cookieName}=${token||''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token?43200:0}${origin.startsWith('https:')?'; Secure':''}`);}
function redirect(res,url){res.writeHead(302,{Location:url,'Cache-Control':'no-store'});res.end();}
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const access=config.requestAccess(req),origin=access?.origin;
  if(!access){reply(res,400,{error:'请求地址格式无效。'});return;}
  try{
    const token=readToken(req),user=auth.session(token);
    if(req.method==='GET'&&pathname==='/health'){reply(res,200,{status:'ok',version:'0.13.0-preview'});return;}
    if(req.method==='GET'&&pathname==='/api/auth/status'){reply(res,200,{setupRequired:auth.setupRequired(),signedIn:!!user,user});return;}
    if(previewMode&&req.method==='GET'&&pathname==='/preview'){const r=await auth.login({username:'previewadmin',password:process.env.FAMILY_PREVIEW_PASSWORD},'local-preview',token);setCookie(res,r.token,origin);redirect(res,'/#assets');return;}
    if(req.method==='GET'&&pathname==='/manifest.webmanifest'){res.writeHead(200,{'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'no-cache'});res.end(JSON.stringify(require('./app-icons.cjs').manifest));return;}
    const iconSize={'/apple-touch-icon.png':180,'/apple-touch-icon-precomposed.png':180,'/icon-192.png':192,'/icon-512.png':512,'/favicon.png':32}[pathname];
    if(req.method==='GET'&&iconSize){res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});res.end(require('./app-icons.cjs').png(iconSize));return;}
    const publicPost=['/api/auth/setup','/api/auth/login','/api/auth/recover'].includes(pathname);
    if(!user&&!publicPost&&!(previewMode&&pathname==='/phone')&&!['/login','/auth.js','/mobile-shell.js','/style.css','/modern.css','/mobile.css'].includes(pathname)){
      if(pathname.startsWith('/api/'))reply(res,401,{error:'请先登录，或登录已过期。'});else redirect(res,'/login');return;
    }
    if(user&&req.method==='GET'&&pathname==='/login'){redirect(res,'/');return;}
    if(req.method==='GET'&&pathname==='/api/runtime'){reply(res,200,{deployment:config.deployment,preview:previewMode,version:'0.13.0-preview'});return;}
    if(req.method==='GET'&&pathname==='/api/catalog'){reply(res,200,require('./banks.cjs'));return;}
    if(req.method==='GET'&&pathname==='/api/state'){provident.runDue();reply(res,200,{...financialState(),hiddenSnapshotDates:maintenance.hiddenSnapshotDates(),history:history.list(),members:memberKeys(),memberProfiles:auth.profiles(),periods:periods.list()});return;}
    if(req.method==='GET'&&pathname==='/api/members'){reply(res,200,{members:auth.listMembers(user)});return;}
    if(req.method==='GET'&&pathname==='/api/provident'){reply(res,200,provident.status());return;}
    if(req.method==='GET'&&pathname==='/api/maintenance'){auth.requireAdmin(user);reply(res,200,{trash:maintenance.list()});return;}
    if(req.method==='GET'&&pathname==='/api/periods/review'){reply(res,200,periods.review(new URL(req.url,'http://localhost').searchParams.get('month')));return;}
    if(req.method==='GET'&&pathname==='/api/periods/preview'){const q=new URL(req.url,'http://localhost').searchParams,p=require('./period-preview.cjs').previewPeriod(financialState(),q.get('month'),q.get('through'));reply(res,200,{...p,ledgerClosed:periods.list().some(r=>r.month===p.month)});return;}
    if(req.method==='GET'&&pathname==='/api/onboarding'){reply(res,200,auth.onboarding(user));return;}
    if(req.method==='GET'&&pathname==='/api/backups/export'){res.setHeader('Content-Disposition','attachment; filename="family-assets-backup.json"');reply(res,200,backups.exportBackup());return;}
    if(req.method==='GET'&&pathname==='/api/backups/status'){reply(res,200,backups.status());return;}
    if(req.method==='GET'&&pathname==='/api/fx'){reply(res,200,process.env.FAMILY_FX_DISABLE==='1'?fx.state():await fx.refresh());return;}
    if(req.method==='POST'&&['/api/provident/manual','/api/provident/rule','/api/maintenance/preview','/api/maintenance/commit','/api/history/preview','/api/history/commit','/api/balances/month','/api/onboarding','/api/records/save','/api/auth/recover','/api/auth/recovery-code','/api/members/profile','/api/members/add','/api/members/remove','/api/members/reset-password','/api/periods/close','/api/periods/reopen','/api/backups/preview','/api/backups/restore','/api/import/preview','/api/import/commit','/api/fx/refresh','/api/accounts','/api/expenses/month','/api/auth/setup','/api/auth/login','/api/auth/logout','/api/auth/password'].includes(pathname)){
      if(!access.sameOrigin){reply(res,403,{error:'不允许跨站提交'});return;}
      if(!(req.headers['content-type']||'').startsWith('application/json')){reply(res,415,{error:'仅接受JSON数据'});return;}
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>(pathname==='/api/backups/preview'?MAX_BYTES+1024:pathname==='/api/history/preview'?1048576:262144)){reply(res,413,{error:'导入内容过大'});return;}chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!publicPost&&!auth.session(token)){reply(res,401,{error:'登录状态已变化，请重新登录。'});return;}
      if(pathname==='/api/auth/recover'){reply(res,200,await auth.recover(input,req.socket.remoteAddress||''));return;}
      if(publicPost){const result=pathname.endsWith('/setup')?await auth.setup(input):await auth.login(input,req.socket.remoteAddress||'',token);setCookie(res,result.token,origin);reply(res,200,{user:result.user,...(result.recoveryCode?{recoveryCode:result.recoveryCode}:{})});return;}
      if(pathname==='/api/provident/manual'){reply(res,200,provident.manual(user,input));return;}
      if(pathname==='/api/provident/rule'){reply(res,200,provident.save(user,input));return;}
      if(pathname==='/api/onboarding'){reply(res,200,auth.saveOnboarding(user,input));return;}
      if(pathname==='/api/maintenance/preview'){auth.requireAdmin(user);reply(res,200,maintenance.preview(input,user));return;}
      if(pathname==='/api/maintenance/commit'){auth.requireAdmin(user);const r=maintenance.commit(input.token,user);auth.recordAction(user,'maintenance/commit');reply(res,200,r);return;}
      if(pathname==='/api/history/preview'){auth.requireAdmin(user);reply(res,200,history.preview(input,user.id));return;}
      if(pathname==='/api/history/commit'){auth.requireAdmin(user);const result=history.commit(input.token,user.id);auth.recordAction(user,pathname);reply(res,200,result);return;}
      if(pathname==='/api/auth/recovery-code'){reply(res,200,auth.renewRecovery(user));return;}
      if(pathname==='/api/members/add'){reply(res,200,{member:await auth.addMember(user,input,token)});return;}
      if(pathname==='/api/members/profile'){reply(res,200,auth.updateMember(user,input));return;}
      if(pathname==='/api/members/remove'){auth.removeMember(user,input.id);reply(res,200,{removed:true});return;}
      if(pathname==='/api/members/reset-password'){await auth.resetMember(user,input,token);reply(res,200,{reset:true});return;}
      if(pathname==='/api/periods/close'){reply(res,200,periods.finish(input,user));auth.recordAction(user,'period/close');return;}
      if(pathname==='/api/periods/reopen'){auth.requireAdmin(user);periods.reopen(input.month);auth.recordAction(user,'period/reopen');reply(res,200,{reopened:true});return;}
      if(pathname==='/api/backups/preview'){reply(res,200,backups.preview(input.backup,user.id));return;}
      if(pathname==='/api/backups/restore'){
        auth.requireAdmin(user);
        if(input.acknowledge!==true)throw Error('请先确认覆盖当前账本。');
        await auth.reauthenticate(user,input.password,token,req.socket.remoteAddress||'');
        const result=backups.restore(input.token,user.id);
        if(!result.alreadyRestored){ledger.invalidateDrafts();portfolio.invalidateDrafts();history.invalidate();auth.recordAction(user,'backup/restore');}
        reply(res,200,result);return;
      }
      if(pathname==='/api/auth/logout'){auth.logout(token);setCookie(res,null,origin);reply(res,200,{signedOut:true});return;}
      if(pathname==='/api/auth/password'){await auth.changePassword(user,input,token,req.socket.remoteAddress||'');setCookie(res,null,origin);reply(res,200,{passwordChanged:true});return;}
      if(pathname==='/api/expenses/month'){periods.assertWritable([input.month+'-01']);const result=expenses.save(input);auth.recordAction(user,pathname);reply(res,200,result);return;}
      if(pathname==='/api/fx/refresh'){reply(res,200,process.env.FAMILY_FX_DISABLE==='1'?fx.state():await fx.refresh(true));return;}
      if(pathname==='/api/balances/month'){const result=await require('./month-balances.cjs').saveMonthBalances(input,{ledger,periods,fx,disableFx:process.env.FAMILY_FX_DISABLE==='1'});auth.recordAction(user,pathname);reply(res,200,result);return;}
      if(pathname==='/api/accounts'){if(!input.id||input.updateValue===true)periods.assertWritable([input.date]);const account=ledger.saveAccount(input);auth.recordAction(user,pathname);reply(res,200,{account});return;}
      periods.assertWritable((input.data?.records||input.prepared?.rows||[]).map(r=>r.date));
      history.assertNoIncomeOverlap(input.data?.records||input.prepared?.rows||[]);
      if(pathname==='/api/records/save'){
        if(!input.data||input.data.format!=='family-assets-import')throw Error('需要有效的收入、转账或余额数据。');
        if(Array.isArray(input.data.records))input.data={...input.data,records:input.data.records.map(r=>r?.type==='income'&&r.category===undefined?{...r,category:require('./asset-types.cjs').incomeCategory(r.source)}:r)};
        const p=ledger.preview(input.data),result=p.kind==='ledger-v2'?ledger.commitPrepared(p.prepared,p.signature):ledger.commit(input.data,p.digest);
        if(!result.alreadyImported)auth.recordAction(user,'records/save');reply(res,200,result);return;
      }
      const result=pathname.endsWith('/preview')?(input.data?.format==='family-assets-portfolio'?{kind:'portfolio',...portfolio.preview(input.data)}:ledger.preview(input.data)):(input.kind==='portfolio'?portfolio.commit(input.prepared,input.signature):input.kind==='ledger-v2'?ledger.commitPrepared(input.prepared,input.signature,input.acknowledgeDuplicate===true):ledger.commit(input.data,input.digest,input.acknowledgeDuplicate===true));
      if(pathname.endsWith('/commit'))auth.recordAction(user,pathname);reply(res,200,result);return;
    }
    if(req.method!=='GET'){reply(res,405,{error:'请求方式不支持'});return;}
    const file=previewMode&&pathname==='/phone'?['phone-preview.html','text/html']:files[pathname]; if(!file){reply(res,404,{error:'页面不存在'});return;}
    res.writeHead(200,{'Content-Type':file[1]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'; frame-ancestors '"+(previewMode?"self":"none")+"'"});
    let content=fs.readFileSync(path.join(__dirname,'prototype',file[0]));if(previewMode&&pathname==='/phone'){const view=new URL(req.url,'http://localhost').searchParams.get('view');if(view==='login')content=content.toString('utf8').replace('src="/#overview"','src="/login"');else if(['entry','assets','income','settings'].includes(view))content=content.toString('utf8').replace('src="/#overview"','src="/#'+view+'"');}res.end(content);
  }catch(e){reply(res,e.statusCode||400,{error:e instanceof SyntaxError?'JSON格式不正确，请粘贴完整内容。':e.message});}
}).listen(port,host,()=>console.log(`Family ledger: http://${host}:${port}`));
let stopping=false;
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
  if(stopping)return;stopping=true;
  server.close(()=>{for(const service of [provident,maintenance,backups,history,periods,ledger,portfolio,expenses,auth])service.close();process.exit(0);});
  setTimeout(()=>process.exit(1),9000).unref();
});
