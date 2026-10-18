(function(root){
 const types=['现金','银行存款','网络平台','银行理财','基金','股票','加密货币','贵金属'];
 const normalize=t=>({'网络平台余额':'网络平台','理财':'银行理财'}[t]||t);
 const needsInstitution=t=>['银行存款','网络平台','银行理财','基金','股票'].includes(normalize(t));
 function institutions(type,accounts=[],banks=[]){type=normalize(type);const base=['银行存款','银行理财'].includes(type)?banks:type==='网络平台'?['微信','支付宝']:type==='股票'?['国泰','中信建投','IBKR','长桥']:type==='基金'?['同花顺','微信','支付宝']:[];return [...new Set([...base,...accounts.filter(a=>normalize(a.type)===type).map(a=>a.institution)].filter(v=>v&&v!=='其他')),'其他'];}
 const api={types,normalize,needsInstitution,institutions};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FamilyAccountCatalog=api;
})(globalThis);
