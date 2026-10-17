const fs=require('node:fs');
const path=require('node:path');
const SOURCE='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const SIX_HOURS=6*60*60*1000;
function parseRates(xml) {
  if(typeof xml!=='string'||xml.length>262144)throw Error('汇率文件格式或大小异常。');
  const date=xml.match(/<Cube\b[^>]*\btime\s*=\s*['"](\d{4}-\d{2}-\d{2})['"]/i)?.[1];
  if(!date||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('汇率日期缺失或无效。');
  const perEuro={EUR:1};
  for(const node of xml.matchAll(/<Cube\b([^>]*)\/?\s*>/gi)) {
    const currency=node[1].match(/\bcurrency\s*=\s*['"]([A-Z]{3})['"]/i)?.[1];
    const raw=node[1].match(/\brate\s*=\s*['"]([0-9]+(?:\.[0-9]+)?)['"]/i)?.[1];
    if(!currency)continue;
    const rate=Number(raw);
    if(!raw||!Number.isFinite(rate)||rate<=0||rate>1e9||Object.hasOwn(perEuro,currency))throw Error('汇率数据包含无效或重复币种。');
    perEuro[currency]=rate;
  }
  if(!perEuro.CNY||!perEuro.USD)throw Error('汇率来源未提供人民币或美元，不能进行有效折算。');
  // 原始表为每欧元对应外币；交叉换算后为每单位外币对应人民币。
  const toCny=Object.fromEntries(Object.entries(perEuro).map(([c,r])=>[c,Number((perEuro.CNY/r).toFixed(10))]));
  toCny.CNY=1;
  return {source:'欧洲央行 ECB',sourceUrl:SOURCE,rateDate:date,base:'CNY',toCny};
}
function createFxService(directory,{fetcher=fetch,now=()=>Date.now()}={}) {
  const filename=path.join(directory,'fx-cache.json');
  let quote=null,lastAttemptAt=null,lastError=null,pending=null;
  try {
    const cache=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(cache.version===1&&cache.quote){
      const q=cache.quote;
      if(q.sourceUrl!==SOURCE||q.base!=='CNY'||!/^(\d{4}-\d{2}-\d{2})$/.test(q.rateDate)||!Number.isFinite(Date.parse(q.fetchedAt))||q.toCny?.CNY!==1||!q.toCny?.USD||!Object.entries(q.toCny).every(([c,r])=>/^[A-Z]{3}$/.test(c)&&Number.isFinite(r)&&r>0))throw Error('缓存格式异常');
      quote=q;
    }
  }catch(e){if(e.code!=='ENOENT')lastError='汇率缓存不可用，需要重新获取。';}
  function state() {
    const age=quote?Math.max(0,Math.floor((now()-Date.parse(quote.rateDate+'T00:00:00Z')))/86400000):null;
    return {quote,status:!quote?'unavailable':lastError||age>5?'stale':'available',refreshing:!!pending,lastAttemptAt,lastError,intervalHours:6};
  }
  function refresh(force=false) {
    if(pending)return pending;
    const recent=lastAttemptAt||quote?.fetchedAt;
    if(recent&&now()-Date.parse(recent)<(force?30000:SIX_HOURS))return Promise.resolve(state());
    lastAttemptAt=new Date(now()).toISOString();
    pending=(async()=>{
      try {
        const response=await fetcher(SOURCE,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{Accept:'application/xml,text/xml'}});
        if(!response.ok)throw Error('汇率来源返回HTTP '+response.status);
        const length=Number(response.headers?.get('content-length')||0);if(length>262144)throw Error('汇率文件过大。');
        const parsed=parseRates(await response.text());
        if(Date.parse(parsed.rateDate+'T00:00:00Z')>now()+86400000)throw Error('来源日期异常，未替换旧汇率。');
        if(quote&&parsed.rateDate<quote.rateDate)throw Error('来源日期早于已缓存汇率，未替换旧汇率。');
        const fresh={...parsed,fetchedAt:new Date(now()).toISOString()};
        fs.mkdirSync(directory,{recursive:true});
        fs.writeFileSync(filename+'.tmp',JSON.stringify({version:1,quote:fresh},null,2));
        fs.renameSync(filename+'.tmp',filename);
        quote=fresh;lastError=null;
      }catch(e){lastError=e.name==='TimeoutError'?'获取超时，保留上次汇率。':'自动获取未成功，保留上次汇率；请检查网络或稍后重试。';}
      finally{pending=null;}
      return state();
    })();
    return pending;
  }
  return {state,refresh};
}
module.exports={parseRates,createFxService};
