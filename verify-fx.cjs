const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseRates,createFxService}=require('./fx.cjs');
// 全部为合成数据，不是实际市场报价。
const xml=`<gesmes:Envelope><Cube><Cube time='2026-10-14'><Cube currency='USD' rate='1.2'/><Cube currency='CNY' rate='8.4'/><Cube currency='JPY' rate='168'/></Cube></Cube></gesmes:Envelope>`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-fx-test-'));
(async()=>{try{
  const q=parseRates(xml);assert.equal(q.toCny.USD,7);assert.equal(q.toCny.EUR,8.4);assert.equal(q.toCny.JPY,.05);assert.equal(q.toCny.CNY,1);
  assert.throws(()=>parseRates(xml.replace("rate='1.2'","rate='0'")),/无效/);
  assert.throws(()=>parseRates(xml.replace("currency='CNY'","currency='XYZ'")),/人民币/);
  assert.throws(()=>parseRates(xml.replace('2026-10-14','2026-02-30')),/日期/);
  let time=Date.parse('2026-10-15T01:00:00Z'),calls=0,fail=false;
  const service=createFxService(dir,{now:()=>time,fetcher:async()=>{calls++;if(fail)throw Error('offline');return{ok:true,headers:{get:()=>null},text:async()=>xml};}});
  const [a,b]=await Promise.all([service.refresh(),service.refresh()]);assert.equal(calls,1);assert.equal(a.quote.rateDate,'2026-10-14');assert.equal(b.status,'available');
  await service.refresh();assert.equal(calls,1);
  fail=true;time+=7*60*60*1000;
  const stale=await service.refresh();assert.equal(stale.status,'stale');assert.equal(stale.quote.toCny.USD,7);assert.equal(stale.quote.rateDate,'2026-10-14');
  const reopened=createFxService(dir,{now:()=>time,fetcher:async()=>{throw Error('offline');}});assert.equal(reopened.state().quote.toCny.USD,7);
  time+=7*60*60*1000;assert.equal((await reopened.refresh()).status,'stale');
  const emptyDir=path.join(dir,'empty');const empty=createFxService(emptyDir,{fetcher:async()=>{throw Error('offline');},now:()=>time});assert.equal((await empty.refresh()).status,'unavailable');assert.equal(empty.state().quote,null);
  console.log('汇率检查通过：人民币交叉折算、报价日期、非法数据、合并并发请求、缓存节流、断网保留旧值、重开读取及首次失败。');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
