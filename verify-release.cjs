const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]),app=path.join(root,'jiayoushu'),data=path.join(root,'test-data');
assert(fs.existsSync(path.join(app,'Dockerfile')));assert(fs.existsSync(path.join(app,'.env.example')));assert(!fs.existsSync(path.join(app,'data')));assert(!fs.existsSync(path.join(app,'.env')));
const server=spawn(process.execPath,['server.cjs'],{cwd:app,env:{...process.env,PORT:'4323',HOST:'127.0.0.1',FAMILY_DATA_DIR:data,FAMILY_FX_DISABLE:'1',APP_ORIGINS:'http://127.0.0.1:4323'},stdio:['ignore','pipe','pipe']});
(async()=>{try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('安装包服务退出 '+c)));});
 assert.equal((await fetch('http://127.0.0.1:4323/health')).status,200);
 assert.equal((await(await fetch('http://127.0.0.1:4323/api/auth/status')).json()).setupRequired,true);
 assert.equal((await fetch('http://127.0.0.1:4323/api/state')).status,401);
 const login=await fetch('http://127.0.0.1:4323/login');assert.equal(login.status,200);assert((await login.text()).includes('setupForm'));
 const health=spawn(process.execPath,['healthcheck.cjs'],{cwd:app,env:{...process.env,PORT:'4323'},stdio:'ignore'});assert.equal(await new Promise(resolve=>health.once('exit',resolve)),0);
 console.log('安装包解压启动检查通过：源文件完整、初始无账号、账本未暴露、容器健康检查脚本通过；不等同于容器运行测试。');
 }finally{server.kill();await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
