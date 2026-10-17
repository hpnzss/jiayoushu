function scaled(value,places=2){if(typeof value!=='string'||!new RegExp('^(0|[1-9]\\d{0,10})(\\.\\d{1,'+places+'})?$').test(value))throw Error('金额或汇率格式无效，请填写非负数字文本。');const [a,b='']=value.split('.');return BigInt(a)*10n**BigInt(places)+BigInt(b.padEnd(places,'0'));}
function safe(n){const x=Number(n);if(!Number.isSafeInteger(x))throw Error('金额超出安全计算范围。');return x;}
function convert(cents,rate){const n=BigInt(cents)*scaled(rate,10),sign=n<0n?-1n:1n;return safe(sign*((sign*n+5000000000n)/10000000000n));}
function validDate(s){try{return typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}catch{return false;}}
function resolveFx(currency,date,manual,quote){
  if(currency==='CNY')return{rate:'1',date,source:'人民币本币'};
  if(manual){if(typeof manual.source!=='string'||!manual.source.trim()||manual.source.length>100||!validDate(manual.date)||manual.date>date||scaled(manual.rate,10)<=0n)throw Error('请填写有效汇率、不晚于发生日的汇率日期和来源。');return{rate:manual.rate,date:manual.date,source:manual.source.trim()};}
  if(!quote?.toCny?.[currency])throw Error('暂无此币种的自动汇率，请更新或填写手动参考汇率。');
  if(quote.rateDate>date)throw Error('自动汇率晚于发生日，历史补录需要对应日期的手动参考汇率。');
  return{rate:quote.toCny[currency].toFixed(10),date:quote.rateDate,source:quote.source,fetchedAt:quote.fetchedAt};
}
function resolveLatestFx(currency,quote){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
 if(!quote||!validDate(quote.rateDate)||quote.rateDate>today||typeof quote.source!=='string'||!Number.isFinite(quote.toCny?.[currency])||quote.toCny[currency]<=0)throw Error('暂未取得'+currency+'自动汇率，请更新汇率后重试；本次未保存。');
 return{rate:quote.toCny[currency].toFixed(10),date:quote.rateDate,source:quote.source,policy:'latest',...(quote.fetchedAt?{fetchedAt:quote.fetchedAt}:{})};
}
module.exports={scaled,safe,convert,validDate,resolveFx,resolveLatestFx};
