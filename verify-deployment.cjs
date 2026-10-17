const assert=require('node:assert/strict'),http=require('node:http'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runtime}=require('./runtime.cjs');
assert.throws(()=>runtime({APP_ORIGINS:'https://example.com/path'}));assert.throws(()=>runtime({APP_ORIGINS:'https://example.com:10062,http://example.com:10062'}));assert.throws(()=>runtime({APP_ORIGINS:'*'}));
const config=runtime({HOST:'0.0.0.0',APP_ORIGINS:'http://192.168.1.100:20001,https://finance.example.com:10062'});assert(config.deployment);assert.equal(config.originFor('finance.example.com:10062'),'https://finance.example.com:10062');assert(!config.originFor('finance.example.com'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'family-deploy-test-')),server=spawn(process.execPath,['server.cjs'],{cwd:__dirname,env:{...process.env,PORT:'4322',HOST:'127.0.0.1',APP_ORIGINS:'http://192.168.1.100:20001,https://finance.example.com:10062',FAMILY_DATA_DIR:root,FAMILY_FX_DISABLE:'1'},stdio:['ignore','pipe','pipe']});
let cookie='';
function request(route,{authority='finance.example.com:10062',origin,body,extra={}}={}){return new Promise((resolve,reject)=>{const data=body?JSON.stringify(body):null;const req=http.request({host:'127.0.0.1',port:4322,path:route,method:data?'POST':'GET',headers:{Host:authority,...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...extra}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{if(res.headers['set-cookie'])cookie=res.headers['set-cookie'][0].split(';')[0];const text=Buffer.concat(chunks).toString();resolve({status:res.statusCode,headers:res.headers,text,body:res.headers['content-type']?.includes('json')?JSON.parse(text):null});});});req.on('error',reject);req.end(data);});}
(async()=>{try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('服务启动失败 '+c)));});
 assert.equal((await request('/login')).status,200);assert.equal((await request('/health',{authority:'bad.example:4318',extra:{'X-Forwarded-Host':'finance.example.com:10062'}})).status,403);
 assert.equal((await request('/api/auth/status',{authority:'finance.example.com'})).status,403);
 const users=[{username:'deployone',password:'deploy-test-1234',confirmPassword:'deploy-test-1234'},{username:'deploytwo',password:'deploy-test-5678',confirmPassword:'deploy-test-5678'}];
 assert.equal((await request('/api/auth/setup',{origin:'https://evil.example',body:{admin:users[0]}})).status,403);
 const setup=await request('/api/auth/setup',{origin:'https://finance.example.com:10062',body:{admin:users[0]}});assert.equal(setup.status,200);assert.match(setup.headers['set-cookie'][0],/; Secure/);
 assert.equal((await request('/api/state')).status,200);const loginPage=await request('/login');assert.equal(loginPage.status,302);assert.equal(loginPage.headers.location,'/');
 assert.equal((await request('/api/auth/logout',{origin:'http://192.168.1.100:20001',body:{}})).status,403);
 const logout=await request('/api/auth/logout',{origin:'https://finance.example.com:10062',body:{}});assert.match(logout.headers['set-cookie'][0],/Max-Age=0; Secure/);
 const login=await request('/api/auth/login',{authority:'192.168.1.100:20001',origin:'http://192.168.1.100:20001',body:{username:'deployone',password:'deploy-test-1234'}});assert.equal(login.status,200);assert(!login.headers['set-cookie'][0].includes('; Secure'));
 assert.equal((await request('/api/auth/logout',{body:{},extra:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 console.log('部署访问检查通过：域名端口保留、HTTPS Cookie、局域网访问、登录相对跳转、跨站拒绝、忽略伪造代理头。');
 }finally{server.kill();await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));if(path.dirname(root)===os.tmpdir())fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
