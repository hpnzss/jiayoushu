async function saveMonthBalances(input,{ledger,periods,fx,disableFx=false}){
 if(!input||typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{8,70}$/.test(input.requestId)||!Array.isArray(input.balances)||!input.balances.length||input.balances.length>100)throw Error('请填写本次要保存的账户余额。');
 periods.assertWritable([input.date]);const accounts=ledger.state().accounts,seen=new Set();
 const records=input.balances.map(b=>{const a=accounts.find(a=>a.id===b.account);if(!a||seen.has(a.id))throw Error('账户无效或重复。');seen.add(a.id);return{type:'balance',date:input.date,account:a.id,amount:b.amount,time:input.time||'23:59:59',fxPolicy:'latest',correction:true,memo:'实际余额核对；外币使用最新参考汇率折算'};});
 if(records.some(r=>accounts.find(a=>a.id===r.account).currency!=='CNY')&&!disableFx)await fx.refresh();
 // 网络取价期间可能由另一位成员关账，提交前再次检查。
 periods.assertWritable([input.date]);
 const data={format:'family-assets-import',version:2,batchId:'month-'+input.requestId,records},p=ledger.preview(data),result=ledger.commitPrepared(p.prepared,p.signature);
 return{...result,rateStatus:fx.state().status};
}
module.exports={saveMonthBalances};
