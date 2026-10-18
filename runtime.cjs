function authority(value){if(typeof value!=='string'||!value||/[\s,/@?#\\]/.test(value))return null;try{const u=new URL('http://'+value);return value.toLowerCase();}catch{return null;}}
function requestAccess(req){
 const host=authority(req.headers.host);if(!host)return null;
 const forwardedHost=authority(String(req.headers['x-forwarded-host']||'').split(',')[0].trim());
 const forwardedProto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
 let supplied=null;try{const u=new URL(req.headers.origin);if(['http:','https:'].includes(u.protocol)&&u.origin===req.headers.origin)supplied=u;}catch{}
 // 不设域名白名单。Fetch Metadata用于识别浏览器同源提交；旧客户端比较请求与转发的Host。
 const site=req.headers['sec-fetch-site'];
 const sameOrigin=site!=='cross-site'&&(!req.headers.origin||!!supplied&&(site==='same-origin'||[host,forwardedHost].filter(Boolean).some(a=>new URL(supplied.protocol+'//'+a).host===supplied.host)));
 // 代理头只帮助识别HTTPS，不授予登录权限；跳转始终使用相对路径。
 const secure=Boolean(req.socket?.encrypted||forwardedProto==='https'||sameOrigin&&supplied?.protocol==='https:');
 return{origin:(secure?'https://':'http://')+(forwardedHost||host),secure,sameOrigin};
}
function runtime(env=process.env){const port=Number(env.PORT||4318),host=env.HOST||'127.0.0.1';if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT必须为有效端口。');return{port,host,requestAccess,deployment:host==='0.0.0.0'};}
module.exports={runtime,requestAccess};
