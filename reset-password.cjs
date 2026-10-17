'use strict';
// 仅供持有NAS终端权限的管理员离线恢复账号，不注册任何网页接口。
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,createHash,scrypt}=require('node:crypto');
const derive=require('node:util').promisify(scrypt);
function openExisting(filename){
  if(!fs.existsSync(filename))throw Error('未找到现有账本，已停止。');
  const db=new DatabaseSync(filename);db.exec('PRAGMA busy_timeout=5000;');return db;
}
function findUser(db,username){
  if(typeof username!=='string'||!/^[A-Za-z0-9._-]{3,40}$/.test(username))throw Error('登录名无效。');
  const user=db.prepare('SELECT * FROM auth_users WHERE username=?').get(username.toLowerCase());
  if(!user)throw Error('没有找到该登录账号，已停止。');return user;
}
async function resetPassword(filename,username,password,confirmation){
  if(typeof password!=='string')throw Error('请填写密码，尚未修改。');
  if(password!==confirmation)throw Error('两次密码不一致，尚未修改。');
  const db=openExisting(filename);
  try{
    const user=findUser(db,username),salt=randomBytes(16).toString('hex');
    const passwordHash=Buffer.from(await derive(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024})).toString('hex');
    db.exec('BEGIN IMMEDIATE');
    try{
      if(findUser(db,username).password_hash!==user.password_hash)throw Error('账号刚被修改，请重新执行。');
      db.prepare('UPDATE auth_users SET salt=?,password_hash=? WHERE id=?').run(salt,passwordHash,user.id);
      db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(user.id);
      const key='user:'+createHash('sha256').update(user.username).digest('hex');
      db.prepare('DELETE FROM auth_failures WHERE key=?').run(key);
      db.prepare('INSERT INTO activity_log(user_id,action,at) VALUES(?,?,?)').run(user.id,'auth/reset-via-terminal',new Date().toISOString());
      db.exec('COMMIT');return{username:user.username,member:user.member};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }finally{db.close();}
}
async function main(){
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('请在PuTTY中交互执行，不要使用-T或输入重定向。');
  const filename=path.join(process.env.FAMILY_DATA_DIR||'/data','family.sqlite'),username=process.argv[2];
  const db=openExisting(filename);let user;try{user=findUser(db,username);}finally{db.close();}
  process.stdout.write(`将重设 ${user.username}（${user.member}）的密码，账目和另一位成员账号保留。\n`);
  const {Writable}=require('node:stream');
  const hidden=new Writable({write(chunk,encoding,done){done();}});
  const rl=require('node:readline/promises').createInterface({input:process.stdin,output:hidden,terminal:true,historySize:0});
  const abort=new AbortController();rl.on('SIGINT',()=>abort.abort());
  async function ask(prompt){process.stdout.write(prompt);try{return await rl.question('',{signal:abort.signal});}finally{process.stdout.write('\n');}}
  let password,confirmation;
  try{password=await ask('输入新密码（输入不显示）：');confirmation=await ask('再次输入新密码（输入不显示）：');}
  finally{rl.close();hidden.end();}
  const result=await resetPassword(filename,username,password,confirmation);
  password=confirmation=null;
  process.stdout.write(`已重设 ${result.username} 的密码。该账号的旧登录已退出，请回网页重新登录。\n`);
}
if(require.main===module)main().catch(e=>{console.error(e.name==='AbortError'?'已取消，未修改密码。':e.message);process.exitCode=1;});
module.exports={resetPassword};
