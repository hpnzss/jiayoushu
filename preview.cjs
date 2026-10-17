const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
const dir=path.join(__dirname,'.preview-data'),marker=path.join(dir,'PREVIEW_ONLY');
if(fs.existsSync(dir)&&!fs.existsSync(marker))throw Error('预览目录缺少隔离标记，拒绝使用。');
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(marker,'仅保存虚拟预览资料，不是群晖正式账本。\n');
process.env.FAMILY_DATA_DIR=dir;process.env.FAMILY_PREVIEW_PASSWORD=randomBytes(24).toString('hex');process.env.PORT='4321';process.env.HOST='127.0.0.1';process.env.APP_ORIGINS='http://127.0.0.1:4321,http://localhost:4321';
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
