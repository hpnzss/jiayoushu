const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {resolve,valid}=require('./prototype/panel-filters.js'),{shortMoney}=require('./prototype/chart-labels.js');
assert.equal(resolve({preset:'month'},'2024-03-31').start,'2024-02-29');
assert.equal(resolve({preset:'3'},'2026-01-05').start,'2025-11-01');
assert.equal(resolve({preset:'current'},'2026-10-18').start,'2026-10-01');
assert.equal(resolve({preset:'all'},'2026-10-18','2018-01-01').start,'2018-01-01');
assert(!valid('2026-02-29'));assert(valid('2024-02-29'));
assert.throws(()=>resolve({preset:'custom',start:'2026-10-19',end:'2026-10-18'},'2026-10-18'));
assert.throws(()=>resolve({preset:'custom',start:'2026-10-01',end:'2026-10-19'},'2026-10-18'));
assert.equal(shortMoney(12345678),'¥12.35万');assert.equal(shortMoney(12345678900),'¥1.23亿');
assert.equal(shortMoney(-2000000),'¥-2万');assert.equal(shortMoney(0),'¥0');assert.equal(shortMoney(null),'资料不足');
// Exercise the browser state module without a DOM: scope, persistence, users,
// corrupt/unavailable storage, and the report arguments must remain independent.
{
 const vm=require('node:vm'),saved=new Map(),code=fs.readFileSync(path.join(__dirname,'prototype/panel-filters.js'),'utf8');
 function browser(member='one',blocked=false){const context={location:{origin:'http://test.local'},currentFamilyUser:{member},document:{addEventListener(){},dispatchEvent(){}},CustomEvent:class{constructor(name,options){this.type=name;this.detail=options.detail;}},localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return saved.get(k);},setItem:(k,v)=>{if(blocked)throw Error('blocked');saved.set(k,v);}},FamilyReport:{today:'2026-10-18',reportingIncomes:()=>[{date:'2018-01-01'}],reportingSnapshots:()=>[],expenseSummaries:[],report:(start,end,member)=>({start,end,member})}};vm.createContext(context);vm.runInContext(code,context);return context.FamilyPanelFilters;}
 const one=browser();one.set('income-details',{preset:'current'});one.set('reportIncomeLines',{preset:'3'});one.update('reportIncomeLines',{numbers:false},'numbers');
 assert.equal(one.report('income-details','甲').start,'2026-10-01');assert.equal(one.report('income-details','甲').member,'甲');assert.equal(one.range('reportIncomeLines').start,'2026-08-01');assert.equal(one.range('expense-summary').start,'2018-01-01');
 const reloaded=browser();assert.equal(reloaded.range('income-details').start,'2026-10-01');assert.equal(reloaded.numbers('reportIncomeLines'),false);assert.equal(reloaded.numbers('asset-trend'),true);
 assert.equal(browser('two').range('income-details').start,'2018-01-01');
 saved.set('family-panel-controls-v1:http://test.local:broken','{invalid');assert.equal(browser('broken').range('income-details').start,'2018-01-01');
 const unavailable=browser('offline',true);unavailable.set('income-details',{preset:'current'});assert.equal(unavailable.range('income-details').start,'2026-10-01');
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'family-v014-')),file=path.join(root,'family.sqlite'),services=[];
const keep=x=>(services.push(x),x),{openLedger,normalize}=require('./ledger.cjs');
const auth=keep(require('./auth.cjs').openAuth(file)),portfolio=keep(require('./portfolio.cjs').openPortfolio(file)),expenses=keep(require('./expenses.cjs').openExpenses(file)),ledger=keep(openLedger(file,{seedDefaults:false}));
const profiles=()=>[{key:'成员一',name:'甲',active:true},{key:'成员二',name:'乙',active:true}];
const periods=keep(require('./periods.cjs').openPeriods(file,{state:()=>({...ledger.state(),expenseSummaries:expenses.list()}),today:()=> '2026-10-18'}));
const history=keep(require('./history.cjs').openHistory(file,{profiles,state:()=>ledger.state(),periods:()=>periods.list()})),backups=keep(require('./backup.cjs').openBackups(file));
const maintenance=keep(require('./maintenance.cjs').openMaintenance(file,{ledger,periods,history,profiles,backup:()=>backups.safety()}));
const provident=keep(require('./provident.cjs').openProvident(file,{ledger,periods,history,auth:{profiles},today:()=> '2026-10-18'}));
const user={id:'test-admin',role:'admin'},perform=x=>maintenance.commit(maintenance.preview(x,user).token,user);
let n=0;function save(records){const p=ledger.preview({format:'family-assets-import',version:2,batchId:'historical-income-'+(++n),records});ledger.commitPrepared(p.prepared,p.signature);return ledger.ownRows().at(-1).order;}
try{
 const a=ledger.saveAccount({name:'虚拟存款',owner:'成员一',type:'现金',currency:'CNY',date:'2026-10-01',amount:'1000'});
 const input={type:'income',date:'2024-03-10',account:a.id,member:'成员一',source:'工资',category:'工资奖金',amount:'100'};
 const id=save([input]);
 const fund=provident.manual(user,{member:'成员一',account:a.id,date:'2023-02-10',amount:'50',requestId:'historical-fund-01'});assert.equal(fund.beforeOpening,true);
 const balance=()=>ledger.state().balances.find(b=>b.id===a.id).nativeCents;
 assert.equal(balance(),100000);assert.equal(ledger.state().incomes.reduce((n,r)=>n+r.cents,0),15000);
 assert.deepEqual(ledger.state().snapshots.map(s=>s.date),['2026-10-01']);
 perform({action:'edit-record',id,values:{amount:'120',date:'2022-01-10'}});assert.equal(balance(),100000);assert.equal(ledger.state().incomes.find(r=>r.order===id).cents,12000);
 perform({action:'delete-record',id});assert.equal(ledger.state().incomes.length,1);assert.equal(balance(),100000);
 perform({action:'restore',id:maintenance.list().find(t=>t.action==='delete-record').id});assert.equal(ledger.state().incomes.length,2);assert.equal(balance(),100000);
 // Backfilled income must coexist with real historical valuations, without zero snapshots.
 const b=ledger.saveAccount({name:'虚拟旧账户',owner:'成员二',type:'现金',currency:'CNY',date:'2020-01-01',amount:'20'});
 save([{type:'balance',date:'2022-01-10',account:b.id,amount:'30'}, {...input,date:'2022-01-10',amount:'5'}]);
 const real=ledger.state().snapshots.find(s=>s.date==='2022-01-10');assert.deepEqual(real.amounts,[0,3000]);assert.equal(balance(),100000);
 const backup=backups.exportBackup(),p=backups.preview(backup,user.id);assert(p.summary);backups.restore(p.token,user.id);assert.equal(balance(),100000);assert.equal(ledger.state().incomes.length,3);
 assert.throws(()=>save([{type:'balance',date:'2024-01-01',account:a.id,amount:'1'}]),/早于/);
 assert.throws(()=>save([{type:'transfer',date:'2024-01-01',account:a.id,target:b.id,amount:'1'}]),/早于/);
 assert.throws(()=>save([{...input,date:'2099-01-01'}]),/未来/);
 assert.throws(()=>save([{...input,account:'missing'}]),/不存在/);
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file);db.prepare('INSERT INTO monthly_periods VALUES(?,?)').run('2024-03',JSON.stringify({month:'2024-03'}));
 assert.throws(()=>provident.manual(user,{member:'成员一',account:a.id,date:'2024-03-10',amount:'1',requestId:'closed-month-test'}),/关账/);db.close();
 console.log('0.14检查通过：独立时间范围、闰年与自选日期、万亿金额、历史收入及公积金补录、期初余额不重复、无虚假资产点、修改删除恢复、备份恢复、转账日期与关账保护。');
}finally{for(const s of services.reverse())s.close();fs.rmSync(root,{recursive:true,force:true});}
