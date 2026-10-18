(function(root){
 const types=['银行存款/理财','现金','网络平台','基金','股票','债券','加密货币','贵金属'];
 const normalize=t=>({'网络平台余额':'网络平台','理财':'银行存款/理财','银行存款':'银行存款/理财','银行理财':'银行存款/理财'}[t]||t);
 const needsInstitution=t=>['银行存款/理财','网络平台','基金','股票','贵金属','债券','加密货币'].includes(normalize(t));
 function institutions(type,accounts=[],banks=[],preferred=[]){type=normalize(type);const bank=['银行存款/理财'].includes(type),base=bank?banks:type==='网络平台'?['微信','支付宝']:['股票','贵金属','债券'].includes(type)?['国泰','中信建投','IBKR','长桥']:type==='加密货币'?['Binance']:type==='基金'?['同花顺','微信','支付宝']:[],known=accounts.filter(a=>bank?['银行存款/理财'].includes(normalize(a.type)):normalize(a.type)===type).map(a=>a.institution);return [...new Set([...(bank?[...preferred,...known]:[]),...base,...known].filter(v=>v&&v!=='其他')),'其他'];}
 function sorted(accounts,profiles=[]){const owners=[...profiles.map(p=>p.key),'共同'],rank=(v,list)=>list.includes(v)?list.indexOf(v):list.length,compare=(a,b)=>String(a||'').localeCompare(String(b||''),'zh-CN');return accounts.slice().sort((a,b)=>rank(a.owner,owners)-rank(b.owner,owners)||compare(a.owner,b.owner)||rank(normalize(a.type),types)-rank(normalize(b.type),types)||compare(a.typeDetail||normalize(a.type),b.typeDetail||normalize(b.type))||compare(a.institution,b.institution)||compare(a.name,b.name)||compare(a.currency,b.currency)||compare(a.id,b.id));}
 const api={types,normalize,needsInstitution,institutions,sorted};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FamilyAccountCatalog=api;
})(globalThis);
