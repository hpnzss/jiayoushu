const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
const dir=path.join(__dirname,'.preview-data'),marker=path.join(dir,'PREVIEW_ONLY');
if(fs.existsSync(dir)&&!fs.existsSync(marker))throw Error('预览目录缺少隔离标记，拒绝使用。');
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(marker,'仅保存虚拟预览资料，不是群晖正式账本。\n');
// 本机预览只使用明确标注的虚拟汇率，生产服务仍自动获取ECB。
const previewFx=path.join(dir,'fx-cache.json');if(!fs.existsSync(previewFx)){const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());fs.writeFileSync(previewFx,JSON.stringify({version:1,quote:{source:'预览固定汇率（虚拟，非实时）',sourceUrl:'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',rateDate:day,fetchedAt:new Date().toISOString(),base:'CNY',toCny:{CNY:1,USD:7.1,HKD:.91,EUR:7.8,JPY:.048,GBP:9.2,SGD:5.5,AUD:4.7,CAD:5.1,CHF:8.2,NZD:4.3,KRW:.0052,THB:.21,MYR:1.6,IDR:.00044,INR:.084,PHP:.125,ZAR:.4}}}));}process.env.FAMILY_FX_DISABLE='1';
process.env.FAMILY_DATA_DIR=dir;process.env.FAMILY_PREVIEW_PASSWORD=randomBytes(24).toString('hex');process.env.PORT='4321';process.env.HOST='127.0.0.1';
const file=path.join(dir,'family.sqlite'),{openAuth}=require('./auth.cjs'),{openLedger}=require('./ledger.cjs');
(async()=>{
 const auth=openAuth(file);let admin;
 if(auth.setupRequired())admin=(await auth.setup({admin:{username:'previewadmin',name:'我（预览）',password:process.env.FAMILY_PREVIEW_PASSWORD,confirmPassword:process.env.FAMILY_PREVIEW_PASSWORD}})).user;
 else{await require('./reset-password.cjs').resetPassword(file,'previewadmin',process.env.FAMILY_PREVIEW_PASSWORD,process.env.FAMILY_PREVIEW_PASSWORD);admin=(await auth.login({username:'previewadmin',password:process.env.FAMILY_PREVIEW_PASSWORD},'preview-launcher')).user;}
 if(!auth.listMembers(admin).some(m=>m.username==='previewfamily')){const password=randomBytes(24).toString('hex');await auth.addMember(admin,{username:'previewfamily',name:'家人（预览）',password,confirmPassword:password});}
 // 预览成员无须另行登录；用户可通过成员设置自己添加演示账号。
 const ledger=openLedger(file,{seedDefaults:false,memberKeys:()=>auth.profiles().map(p=>p.key)});
 if(!ledger.registeredAccounts().length){const now=new Date(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(now),start=today.slice(0,7)+'-01';
 ledger.saveAccount({name:'示例工资卡',owner:admin.member,type:'现金',currency:'CNY',date:start,amount:'30000'});
 ledger.saveAccount({name:'示例公司股票',owner:admin.member,type:'股票',currency:'USD',date:start,amount:'1500',quantity:'10',price:'150',symbol:'DEMO',fx:{rate:'7',date:start,source:'预览示例汇率（非实时）'}});
 }
 ledger.close();auth.close();require('./server.cjs');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
