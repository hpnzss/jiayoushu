function runtime(env=process.env){
  const port=Number(env.PORT||4318),host=env.HOST||'127.0.0.1';
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT必须为有效端口。');
  const origins=new Map();
  const raw=env.APP_ORIGINS===undefined?`http://127.0.0.1:${port},http://localhost:${port}`:env.APP_ORIGINS;
  for(const value of raw.split(',')){
    const entry=value.trim();let u;try{u=new URL(entry);}catch{throw Error('APP_ORIGINS须填写完整访问地址，多个地址用英文逗号分隔。');}
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.hostname.includes('*'))throw Error('访问地址仅允许http或https的域名及端口，不包含路径、账号或通配符。');
    if(origins.has(u.host)&&origins.get(u.host)!==u.origin)throw Error('同一域名及端口只能设置一种访问协议。');
    origins.set(u.host,u.origin);
  }
  // 容器内部健康检查固定使用此地址；不接受转发头改变允许地址或Cookie策略。
  origins.set(`127.0.0.1:${port}`,`http://127.0.0.1:${port}`);
  return{port,host,originFor:authority=>origins.get(authority),deployment:host==='0.0.0.0'};
}
module.exports={runtime};
