'use strict';
(()=>{
 const types=['现金','股票','理财','基金','加密货币','贵金属','其他'];
 const positionTypes=['股票','基金','加密货币','贵金属','债券'];
 const typeName=t=>['银行卡','零钱','外币余额'].includes(t)?'现金':t;
 const assetPanel=$('accountForm').closest('article');assetPanel.querySelector('h2').textContent='建立 / 管理账户';assetPanel.querySelector('.panel-head p').textContent='银行存款/理财、现金、网络平台、股票、基金、加密货币、贵金属及自定义类型统一记录。一个账户只使用一种币种；初始余额 / 市值不算收入。';
 $('holdingRows').closest('article').hidden=true;$('holdingForm').closest('article').hidden=true;$('accounts').parentElement.hidden=true;$('draftPanel').hidden=true;$('sampleDraft').closest('article').hidden=true;$('importExample').hidden=true;
 const summary=document.createElement('article');summary.className='panel';summary.id='unifiedAccounts';summary.innerHTML='<div class="panel-head"><div><h2>家庭全部账户</h2><p>按最新一次已保存的余额或估值汇总，外币保留原币并折算人民币。</p></div><button id="addUnifiedAccount" type="button" class="outline">新增账户</button></div><div class="table-scroll"><table><thead><tr><th>归属</th><th>类型</th><th>银行 / 平台 / 券商</th><th>账户</th><th>原币余额 / 市值</th><th>折合人民币</th><th>最近更新</th><th>操作</th><th>备注</th></tr></thead><tbody id="unifiedAccountRows"></tbody></table></div><div id="unifiedAllocation"></div>';
 assetPanel.after(summary);$('unifiedAllocation').append($('currencyBreakdown').parentElement.parentElement);
 const noteField=document.createElement('label');noteField.className='field full';noteField.textContent='账户备注（选填）';noteField.innerHTML+='<textarea id="manageNote" maxlength="4000" rows="3" placeholder="访问方法、密码保存位置、验证码获取方式等"></textarea>';$('saveAccount').before(noteField);
 const operation=document.createElement('label');operation.className='field full';operation.id='assetOperationField';operation.innerHTML='本次操作<select id="assetOperation"><option value="info">修改账户资料</option><option value="value">更新余额 / 市值</option></select>';$('manageAccount').parentElement.after(operation);
 const quantityPanel=document.createElement('div');quantityPanel.className='full form-grid';quantityPanel.id='assetPositionFields';quantityPanel.innerHTML='<label class="field full">估值方式<select id="assetValueMode"><option value="amount">直接填总市值</option><option value="quantity">数量 × 单价</option></select></label><label class="field full" id="assetSymbolField">代码 / 计量单位（选填）<input id="assetSymbol" maxlength="60" placeholder="如：股票代码、基金代码、BTC、黄金（克）"></label><label class="field" id="assetQuantityField">数量<input id="assetQuantity" type="number" min="0" step="0.000001"></label><label class="field" id="assetPriceField"><span id="assetPriceLabel">每单位价格</span><input id="assetPrice" type="number" min="0" step="0.000001"></label>';$('manageAmountField').before(quantityPanel);
 const manualStatus=document.createElement('p');manualStatus.id='manualStatus';manualStatus.setAttribute('role','status');$('manualForm').after(manualStatus);$('manualForm').querySelector('button').textContent='保存收入';$('manualForm').closest('article').querySelector('.panel-head p').textContent='选择收入分类、成员和到账账户，填写金额后直接保存。内部转账不会计作收入。';$('previewImport').textContent='导入并保存';$('previewImport').closest('article').querySelector('.panel-head p').textContent='把助手整理好的JSON粘贴到这里，检查格式后直接保存。';$('copyGuide').textContent='复制给聊天助手的格式说明';
 const sourceLabel=$('sourceField');sourceLabel.firstChild.textContent='收入分类';
 $('balanceForm').closest('article').hidden=true;
 $('onboardingPanel').querySelector('h2').textContent='从这里开始，把家庭账本建起来';
 $('onboardingPanel').querySelectorAll('li')[0].textContent='建立账户：选择类型、币种并填余额 / 市值';
 const originalRefresh=refreshAccountControls;
 refreshAccountControls=function(){originalRefresh();syncAccountOptions();};
 const oldPortfolio=renderPortfolio;
 renderPortfolio=function(){oldPortfolio();$('portfolioOverview').hidden=true;renderAccounts();};
 let meInput=null,selected='',accountBusy=false;
 const pending=new Map();
 function editableAccounts(){return (D.accounts||[]).filter(a=>!a.archivedAt);}
 function latestPosition(id){const r=(D.records||[]).filter(r=>r.account===id||r.target===id).at(-1);return r&&['opening','balance'].includes(r.type)?r:null;}
 function syncAccountOptions(){const old=$('manageAccount').value;$('manageAccount').replaceChildren(new Option('新增账户',''));for(const a of editableAccounts())$('manageAccount').append(new Option(`${memberName(a.owner)} · ${a.name}（${FamilyChoices.displayType(a)} / ${a.currency}）`,a.id));if(editableAccounts().some(a=>a.id===old))$('manageAccount').value=old;}
 function renderAccounts(){
  $('unifiedAccountRows').replaceChildren();
  let previousOwner=null;for(const b of FamilyAccountCatalog.sorted(D.balances||[],D.memberProfiles||[])){const tr=document.createElement('tr'),p=latestPosition(b.id),name=document.createElement('td');tr.dataset.accountId=b.id;if(previousOwner!==null&&previousOwner!==b.owner)tr.classList.add('account-group-start');previousOwner=b.owner;for(const value of [memberName(b.owner),FamilyChoices.displayType(b),b.institution?FamilyChoices.bankName(b.institution):'—']){const td=document.createElement('td');td.textContent=value;tr.append(td);}name.textContent=b.name+(b.archivedAt?' · 已归档':'');if(p?.quantity!==undefined){const detail=document.createElement('small');detail.className='muted asset-detail';detail.textContent=`${p.symbol?p.symbol+' · ':''}${p.quantity} × ${p.price} ${b.currency}`;name.append(detail);}tr.append(name);
   for(const value of [nativeMoney(b.nativeCents,b.currency),money(b.cents),b.lastEventDate||b.confirmedDate||'待确认']){const td=document.createElement('td');td.textContent=value;tr.append(td);}
   const action=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='outline';button.textContent=b.archivedAt?'已归档':'更新';button.disabled=!!b.archivedAt;button.onclick=()=>{$('manageAccount').value=b.id;selectAccount();$('assetOperation').value='value';updateAssetFields();assetPanel.scrollIntoView({behavior:'smooth',block:'start'});};action.className='row-actions';action.append(button);tr.append(action);const remarks=document.createElement('td');remarks.className='account-note';if(b.note){const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');summary.textContent='查看备注';text.textContent=b.note;details.append(summary,text);remarks.append(details);}else remarks.textContent='—';tr.append(remarks);$('unifiedAccountRows').append(tr);
  }
  if(!D.accounts.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=9;td.className='empty';td.textContent='还没有账户，在上方选择类型并建立第一个账户。';tr.append(td);$('unifiedAccountRows').append(tr);}
  const currency=new Map(),type=new Map();for(const b of D.balances||[]){if(b.cents===null)continue;currency.set(b.currency,(currency.get(b.currency)||0)+b.cents);type.set(FamilyChoices.displayType(b),(type.get(FamilyChoices.displayType(b))||0)+b.cents);}
  function draw(id,groups){$(id).replaceChildren();for(const [name,cents]of groups){const row=document.createElement('div');row.className='setting-row';const a=document.createElement('span'),b=document.createElement('strong');a.textContent=name;b.textContent=money(cents);row.append(a,b);$(id).append(row);}}
  draw('currencyBreakdown',currency);draw('typeBreakdown',type);
 }
 function selectAccount(){
  selected=$('manageAccount').value;const a=editableAccounts().find(a=>a.id===selected),b=(D.balances||[]).find(a=>a.id===selected),p=latestPosition(selected);meInput=null;
  $('manageName').value=a?.name||'';$('manageNote').value=a?.note||'';$('manageNote').disabled=!!a?.portfolioLegacy;$('manageOwner').value=a?.owner||window.currentFamilyUser?.member||D.members?.[0]||'共同';$('manageType').value=typeName(a?.type||'现金');
  if(a&&!Array.from($('manageCurrency').options).some(o=>o.value===a.currency))$('manageCurrency').append(new Option(a.currency,a.currency));$('manageCurrency').value=a?.currency||'CNY';
  $('manageDate').value=D.today;$('manageAmount').value=b?.nativeCents!==null&&b?.nativeCents!==undefined?(b.nativeCents/100).toFixed(2):'';
  $('assetValueMode').value=p?.quantity!==undefined?'quantity':'amount';$('assetQuantity').value=p?.quantity||'';$('assetPrice').value=p?.price||'';$('assetSymbol').value=p?.symbol||'';
  $('assetOperation').value=a?.portfolioLegacy?'value':'info';
  FamilyChoices.select(a);
  if(b?.fx&&b.fx.date<=D.today){$('manageRate').value=b.fx.rate;$('manageRateDate').value=b.fx.date;$('manageRateSource').value=b.fx.source;}
  updateAssetFields();
 }
 function updateAssetFields(){
  const a=editableAccounts().find(a=>a.id===$('manageAccount').value),legacy=!!a?.portfolioLegacy,edit=!!a,value=!edit||$('assetOperation').value==='value',pos=positionTypes.includes($('manageType').value)&&value,quantity=pos&&$('assetValueMode').value==='quantity',manual=value&&$('manageCurrency').value!=='CNY'&&$('manageFxMode').value==='manual';
  $('assetOperationField').hidden=!edit;$('assetOperation').disabled=legacy;
  for(const id of ['manageName','manageOwner','manageType'])$(id).disabled=legacy;$('manageCurrency').disabled=edit;
  $('manageDateField').hidden=$('manageAmountField').hidden=!value;$('manageDate').required=$('manageAmount').required=value;$('manageDateField').firstChild.textContent=edit?'余额 / 估值日期':'纳入日期';$('manageAmountField').firstChild.textContent=`${['银行存款/理财','现金','银行存款','网络平台余额','网络平台'].includes($('manageType').value)?'余额':'总市值'}（${$('manageCurrency').value}）`;
  $('assetPositionFields').hidden=!pos;$('assetQuantityField').hidden=$('assetPriceField').hidden=$('assetSymbolField').hidden=!quantity;$('assetQuantity').required=$('assetPrice').required=quantity;$('manageAmount').readOnly=quantity;$('assetPriceLabel').textContent=`每单位价格（${$('manageCurrency').value}）`;
  $('manageFxField').hidden=!value||$('manageCurrency').value==='CNY';for(const [field,input]of [['manageRateField','manageRate'],['manageRateDateField','manageRateDate'],['manageRateSourceField','manageRateSource']]){$(field).hidden=!manual;$(input).required=manual;}
  $('saveAccount').textContent=!edit?'保存新账户':value?'保存余额 / 市值':'保存账户资料';
  if(quantity&&$('assetQuantity').value!==''&&$('assetPrice').value!=='')try{$('manageAmount').value=FamilyClient.product($('assetQuantity').value,$('assetPrice').value);}catch(e){$('accountStatus').textContent=e.message;}
 }
 updateManageFields=updateAssetFields;$('manageAccount').onchange=selectAccount;
 for(const id of ['manageType','manageCurrency','manageFxMode','assetOperation','assetValueMode','assetQuantity','assetPrice'])$(id).onchange=$(id).oninput=()=>{meInput=null;updateAssetFields();};
 $('accountForm').addEventListener('input',()=>{meInput=null;});
 $('addUnifiedAccount').onclick=()=>{$('manageAccount').value='';selectAccount();$('accountStatus').textContent='';assetPanel.scrollIntoView({behavior:'smooth',block:'start'});};
 async function directSave(data,key){const signature=JSON.stringify({...data,batchId:undefined}),prior=pending.get(key);if(prior?.signature===signature)data=prior.data;else pending.set(key,{signature,data});const r=await api('/api/records/save',{data});pending.delete(key);return r;}
 $('accountForm').onsubmit=async e=>{
  e.preventDefault();if(accountBusy)return;const a=editableAccounts().find(a=>a.id===$('manageAccount').value),value=!a||$('assetOperation').value==='value';
  try{const body={...(a?{id:a.id}:{}),name:$('manageName').value.trim(),owner:$('manageOwner').value,type:$('manageType').value};
   Object.assign(body,FamilyChoices.accountFields(),{note:$('manageNote').value});
   if(value){Object.assign(body,{currency:body.currency||$('manageCurrency').value,date:$('manageDate').value,amount:$('manageAmount').value,...(a?{updateValue:true}:{})});if(positionTypes.includes(body.type)&&$('assetValueMode').value==='quantity')Object.assign(body,{quantity:$('assetQuantity').value,price:$('assetPrice').value,symbol:$('assetSymbol').value.trim()});if(!$('manageRateField').hidden)body.fx={rate:$('manageRate').value,date:$('manageRateDate').value,source:$('manageRateSource').value.trim()};}
   const signature=JSON.stringify(body);if(!meInput||meInput.signature!==signature){if(a&&value&&body.date===D.today)body.time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());body.requestId=FamilyClient.newId();meInput={signature,body};}
   accountBusy=true;$('saveAccount').disabled=true;$('accountStatus').textContent='正在保存…';
   let id=a?.id;if(a?.portfolioLegacy){const {date,amount,quantity,price,symbol,fx,time}=meInput.body;await directSave({format:'family-assets-import',version:2,batchId:FamilyClient.newId(),records:[{type:'balance',date,account:a.id,amount,...(quantity!==undefined?{quantity,price,symbol}:{}),...(fx?{fx}:{}),...(time?{time}:{})}]},'account');}
   else id=(await api('/api/accounts',meInput.body)).account.id;
   meInput=null;await refreshLedger();$('manageAccount').value=id;selectAccount();$('accountStatus').textContent='已保存。账户列表、家庭资产和统计已更新。';
  }catch(x){$('accountStatus').textContent=x.message;}finally{accountBusy=false;$('saveAccount').disabled=false;}
 };
 $('manualForm').onsubmit=async e=>{
  e.preventDefault();const button=e.currentTarget.querySelector('button');if(button.disabled)return;
  const r={type:$('recordKind').value,date:$('recordDate').value,account:$('recordAccount').value,amount:$('recordAmount').value};if(!r.account){$('manualStatus').textContent='请先建立账户。';return;}
  if(r.type==='income'){try{Object.assign(r,{member:$('recordMember').value,...FamilyChoices.incomeFields()});}catch(x){$('manualStatus').textContent=x.message;return;}}
  if(r.type==='transfer'){r.target=$('targetAccount').value;r.fee=$('recordFee').value||'0';if(!$('targetAmountField').hidden)r.targetAmount=$('recordTargetAmount').value;}
  if($('recordMemo').value)r.memo=$('recordMemo').value;if($('recordTime').value)r.time=$('recordTime').value;
  if($('recordFxMode').value==='manual'){const source={date:$('recordRateDate').value,source:$('recordRateSource').value.trim()};if(!$('recordRateField').hidden)r.fx={...source,rate:$('recordRate').value};if(!$('targetRateField').hidden)r.targetFx={...source,rate:$('targetRate').value};}
  button.disabled=true;$('manualStatus').textContent='正在保存…';try{const result=await directSave({format:'family-assets-import',version:2,batchId:FamilyClient.newId(),records:[r]},'manual');if(!result.alreadyImported)document.dispatchEvent(new CustomEvent('family-income-saved',{detail:r}));await refreshLedger();$('recordAmount').value='';$('recordMemo').value='';$('manualStatus').textContent=result.alreadyImported?'这次提交已保存，没有重复记账。':r.type==='income'?(r.date<(D.accounts||[]).find(a=>a.id===r.account)?.startDate?'历史收入已保存并计入统计；早于账户纳入日期，不重复增加期初余额。':'收入已保存，到账账户余额和统计已更新。'):'转账已保存，两侧账户余额已更新，不计入收入。';}catch(x){$('manualStatus').textContent=x.message;}finally{button.disabled=false;}
 };
 const oldKind=$('recordKind').onchange;$('recordKind').onchange=()=>{if($('recordKind').value==='transfer'&&$('recordAccount').value===$('targetAccount').value){const other=(D.legacyAccounts||D.accounts).find(a=>a.id!==$('recordAccount').value);if(other)$('targetAccount').value=other.id;}oldKind();$('manualForm').querySelector('button').textContent=$('recordKind').value==='transfer'?'保存转账':'保存收入';};
 $('previewImport').onclick=async()=>{const b=$('previewImport');b.disabled=true;try{const text=$('importText').value.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');const data=JSON.parse(text),r=await directSave(data,'import');await refreshLedger();$('importMessage').textContent=r.alreadyImported?'这批已保存，没有重复导入。':`已保存 ${r.count} 条记录。`;}catch(e){$('importMessage').textContent=e.message;}finally{b.disabled=false;}};
 $('copyGuide').onclick=async()=>{const guide=importGuide()+'\n账户已统一。股票、基金、加密货币、贵金属可记录balance总市值；也可同时带quantity和price，两者最多6位小数且乘积需与amount原币总价值一致。没有RSU或ESPP录入。';$('guidePreview').textContent=guide;$('guidePreview').hidden=false;try{await navigator.clipboard.writeText(guide);$('importMessage').textContent='已复制。';}catch{$('importMessage').textContent='格式已显示在下方，可直接复制。';}};
 function applyPreviewNotices(){if(D.preview){$('appNotice').textContent='可操作预览 · 使用独立示例账本，请只填虚拟数据。可以新增账户、保存收支并刷新检查；不会修改群晖账本。';$('appFooter').textContent='家有数 · V0.14 本地开发预览 · 数据仅保存在这台电脑';}document.querySelector('.badge').textContent=D.preview?'可操作预览 · 直接保存':'家庭账本 · 直接保存';$('manualForm').querySelector('button').textContent=$('recordKind').value==='transfer'?'保存转账':'保存收入';$('manualForm').closest('article').querySelector('.panel-head p').textContent='选择收入分类、成员和到账账户，填写金额后直接保存。';}
 function updateNotices(){if(!D.live)return;$('portfolioOverview').hidden=true;syncAccountOptions();renderAccounts();if(!selected)updateAssetFields();applyPreviewNotices();
  $('onboardingStatus').textContent=`已建立 ${D.accounts.length} 个账户。现金、股票及其他资产都在同一页维护。`;
 }
 document.addEventListener('family-ledger-ready',updateNotices);document.addEventListener('family-app-ready',applyPreviewNotices);window.addEventListener('hashchange',()=>{applyPreviewNotices();if(location.hash==='#assets')updateNotices();});
 api('/api/runtime').then(r=>{D.preview=r.preview;applyPreviewNotices();}).catch(()=>{});
 syncAccountOptions();selectAccount();if(D.live)updateNotices();
})();
