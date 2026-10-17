'use strict';
(()=>{
 const baseTypes=['现金','银行存款','网络平台余额','股票','理财','基金','加密货币','贵金属'],baseIncome=['工资奖金','公积金','开会讲课','股票'];let banks=[];
 function field(after,id,label,html){const el=document.createElement('label');el.className='field';el.id=id+'Field';el.append(document.createTextNode(label));el.insertAdjacentHTML('beforeend',html);after.after(el);return el;}
 const detail=field($('manageType').parentElement,'typeDetail','自定义资产类型','<input id="typeDetail" maxlength="80" placeholder="保存后加入类型选项">');
 const institution=field(detail,'institution','银行 / 平台','<input id="bankSearch" placeholder="搜索银行名称"><select id="institution"></select><small id="bankListNote" class="muted"></small>');
 field(institution,'institutionOther','自定义银行 / 平台','<input id="institutionOther" maxlength="80" placeholder="保存后下次可直接选择">');
 field($('sourceField'),'incomeOther','自定义收入来源','<input id="incomeOther" maxlength="80" placeholder="保存后加入收入分类">');
 const currency=$('manageCurrency');currency.append(new Option('其他','OTHER'));field(currency.parentElement,'currencyOther','其他币种代码','<input id="currencyOther" maxlength="3" pattern="[A-Za-z]{3}" placeholder="三位代码，如 NOK">');
 const accounts=()=>D.accounts||[];
 function options(el,values,current){values=values.filter(v=>v&&v!=='其他');el.replaceChildren(...[...new Set(values)].map(v=>new Option(v,v)),new Option('其他','其他'));el.value=[...el.options].some(o=>o.value===current)?current:values[0]||'其他';}
 function refresh(){const t=$('manageType').value,s=$('recordSource').value;options($('manageType'),[...baseTypes,...accounts().map(a=>a.typeDetail).filter(Boolean)],t);options($('recordSource'),[...baseIncome,...(D.incomes||[]).filter(r=>r.category==='其他'&&r.source!=='其他').map(r=>r.source)],s);for(const a of accounts())if(![...currency.options].some(o=>o.value===a.currency))currency.add(new Option(a.currency,a.currency),currency.options.length-1);update();}
 function bankOptions(current){const type=$('manageType').value,known=accounts().filter(a=>a.type===type).map(a=>a.institution).filter(Boolean),filter=$('bankSearch').value.trim();const all=type==='银行存款'?[...known,...banks]:['微信','支付宝',...known];options($('institution'),all.filter(v=>!filter||v.includes(filter)||v===current),current);}
 function update(){const type=$('manageType').value,has=['银行存款','网络平台余额'].includes(type),legacy=!!accounts().find(a=>a.id===$('manageAccount').value)?.portfolioLegacy;
  detail.hidden=type!=='其他';$('typeDetail').required=type==='其他';institution.hidden=!has;$('bankSearch').hidden=type!=='银行存款';$('bankListNote').textContent=type==='银行存款'?`已收录 ${banks.length} 个银行 / 信用机构名称，可搜索；参考2025年6月名单及常见港澳银行，缺失项可选其他补充。`:'';
  if(has){const current=$('institution').value;bankOptions(current);}$('institutionOtherField').hidden=!has||$('institution').value!=='其他';$('institutionOther').required=!$('institutionOtherField').hidden;
  const income=$('recordKind').value==='income'&&$('recordSource').value==='其他';$('incomeOtherField').hidden=!income;$('incomeOther').required=income;
  $('currencyOtherField').hidden=currency.value!=='OTHER';$('currencyOther').required=currency.value==='OTHER';for(const id of ['typeDetail','institution','institutionOther','bankSearch'])$(id).disabled=legacy;
 }
 function select(a){const type=a?.typeDetail||a?.type||'现金';if(![...$('manageType').options].some(o=>o.value===type))$('manageType').add(new Option(type,type),$('manageType').options.length-1);$('manageType').value=type;$('typeDetail').value=a?.typeDetail||'';$('bankSearch').value='';bankOptions(a?.institution);$('institutionOther').value='';update();}
 function accountFields(){const raw=$('manageType').value,type=baseTypes.includes(raw)?raw:'其他',out={type};if(type==='其他'){out.typeDetail=raw==='其他'?$('typeDetail').value.trim():raw;if(!out.typeDetail)throw Error('请填写自定义资产类型。');}if(['银行存款','网络平台余额'].includes(type)){out.institution=$('institution').value==='其他'?$('institutionOther').value.trim():$('institution').value;if(!out.institution)throw Error('请选择或填写银行 / 平台。');}if(currency.value==='OTHER'){out.currency=$('currencyOther').value.trim().toUpperCase();if(!/^[A-Z]{3}$/.test(out.currency))throw Error('请填写三位英文字母币种代码。');}return out;}
 function incomeFields(){const v=$('recordSource').value,source=v==='其他'?$('incomeOther').value.trim():v;if(!source)throw Error('请填写收入来源。');return{category:baseIncome.includes(v)?v:'其他',source};}
 for(const id of ['manageType','institution','recordSource','recordKind','manageCurrency'])$(id).addEventListener('change',()=>{if(id==='manageType'){$('bankSearch').value='';bankOptions();}update();});$('bankSearch').oninput=()=>bankOptions($('institution').value);
 window.FamilyChoices={refresh,update,select,accountFields,incomeFields,displayType:a=>a.typeDetail||a.type};
 document.addEventListener('family-ledger-ready',refresh);api('/api/catalog').then(r=>{banks=r.banks;update();}).catch(()=>{$('bankListNote').textContent='银行名单暂未加载，可选择其他手动填写。';});refresh();
})();
