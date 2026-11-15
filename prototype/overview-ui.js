'use strict';
(function(root){
 const views=['asset-analysis','income'];
 const select=(requested,saved)=>requested==='trend'||requested==='summary'?'asset-analysis':views.includes(requested)?requested:views.includes(saved)?saved:'asset-analysis';
 function sourceGroups(rows,active){
  const totals=new Map();
  for(const r of rows){const label=(r.category==='其他'?r.source:r.category||r.source)||'其他';if(!totals.has(label))totals.set(label,new Map());const sums=totals.get(label),key=active.includes(r.member)?r.member:null;sums.set(key,(sums.get(key)||0)+r.cents);}
  return [...totals].map(([label,sums])=>({label,sums,total:[...sums.values()].reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,'zh-CN'));
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={select,sourceGroups};return;}
 const overview=document.querySelector('[data-page=overview]'),income=document.querySelector('[data-page=income]');
 const tabs=document.createElement('nav');tabs.className='overview-tabs';tabs.setAttribute('aria-label','家庭概况分析标签');
 const assets=document.createElement('section');assets.id='overview-asset-analysis';income.id='overview-income';
 const panes={'asset-analysis':assets,income};overview.prepend(tabs);overview.append(assets,income);
 for(const [key,label]of [['asset-analysis','资产分析'],['income','收入分析']]){const a=document.createElement('a');a.href='#'+key;a.textContent=label;a.dataset.overviewTab=key;tabs.append(a);panes[key].setAttribute('aria-label',label);}
 assets.append($('asset-types'),$('asset-currencies'),$('trend'));
 const reminder=$('inventoryReminder');if(reminder)assets.prepend(reminder);
 const legacy=document.createElement('div');legacy.hidden=true;overview.append(legacy);
 legacy.append($('overviewMetrics'),$('overview-types'),$('overview-currencies'));const quick=overview.querySelector('.quick-links');if(quick)legacy.append(quick);
 const note=overview.querySelector(':scope > p.demo-notice');if(note)legacy.append(note);
 income.querySelector('.history-entry')?.remove();$('incomeSummary').hidden=true;
 income.prepend($('income'));
 $('incomeSummary').closest('[data-page=income]').querySelector('#incomeTrend')?.closest('section')?.setAttribute('hidden','');
 const sources=$('sources');sources.previousElementSibling.textContent='收入来源明细（含公积金）';
 function refresh(){
  const r=FamilyPanelFilters.report('income-composition'),active=(D.memberProfiles||[]).filter(p=>p.active).map(p=>p.key);
  const members=D.live?active:[...new Set(r.rows.map(row=>row.member))],groups=sourceGroups(r.rows,members),other=groups.some(g=>g.sums.has(null)),keys=other?[...members,null]:members;
  const headings=['收入来源',...keys.map(k=>k===null?'其他归属':memberName(k)),'家庭合计'];
  const rows=groups.map(g=>[g.label,...keys.map(k=>g.sums.has(k)?money(g.sums.get(k)):'—'),money(g.total)]);
  const footer=['合计',...keys.map(k=>money(groups.reduce((sum,g)=>sum+(g.sums.get(k)||0),0))),money(r.income)];
  sources.replaceChildren(makeReportTable('按来源与成员汇总的收入',headings,rows,groups.length?footer:null));
 }
 const storageKey=()=> 'family-overview-tab:'+location.origin+':'+(root.currentFamilyUser?.member||'anonymous');
 function show(requested){if(!['overview','summary','asset-analysis','income','trend',''].includes(requested))return;
  let saved;try{saved=localStorage.getItem(storageKey());}catch{}
  const active=select(requested,saved);for(const [key,pane]of Object.entries(panes))pane.hidden=key!==active;
  for(const a of tabs.querySelectorAll('a')){const chosen=a.dataset.overviewTab===active;a.classList.toggle('active',chosen);if(chosen)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  try{localStorage.setItem(storageKey(),active);}catch{}
  requestAnimationFrame(()=>{render();root.FamilyIncomeCharts?.render();root.FamilyAssetDistribution?.render();});
 }
 root.FamilyOverview={show,refresh};document.addEventListener('family-session-ready',()=>{if(location.hash==='#overview')show('overview');refresh();});
 const entry=document.querySelector('[data-page=entry]'),accounts=document.querySelector('[data-page=assets]'),entryTabs=entry.querySelector('.entry-tabs');
 accounts.id='monthPane-accounts';accounts.setAttribute('role','tabpanel');
 entry.append(accounts);
 entryTabs.className='entry-tabs overview-tabs';
 for(const [view,title,hash]of [['flows','收入与转账','#entry'],['balances','更新余额与估值','#entry-balances'],['accounts','账户与资产','#assets']]){
  let button=entryTabs.querySelector('[data-entry-view='+view+']');if(!button){button=document.createElement('button');button.type='button';button.setAttribute('role','tab');button.dataset.entryView=view;entryTabs.append(button);}
  button.textContent=title;button.onclick=()=>{if(location.hash===hash)root.FamilyEntry.showView(view);else location.hash=hash;};
 }
 const navLink=document.querySelector('[data-route=assets]');navLink.dataset.route='records';navLink.href='#records';navLink.querySelector('span').textContent='记录查询';
 document.querySelector('[data-route=settings] span').textContent='设置';
 pageInfo.overview=['家庭概况','家庭概况','查看资产分布、资产趋势和家庭收入。'];
 $('income').querySelector('.panel-head p').textContent='按所选期间汇总已录收入，含公积金。';
 const oldDetails=$('details');oldDetails.hidden=true;
 $('journalRows').closest('article').hidden=true;
 const exportButton=$('export');
 const recent=document.createElement('details');recent.id='recentRecords';recent.className='panel recent-records';recent.open=true;
 recent.innerHTML='<summary>近期收入与转账</summary><p class="muted">最近录入的 10 条记录，可直接修改或删除。</p><div class="recent-rows"></div><a class="text-action" href="#records">查看全部记录 →</a>';
 const flows=$('monthPane-flows');flows.append(recent);
 const query=document.createElement('section');query.dataset.page='records';query.setAttribute('aria-label','记录查询');query.hidden=true;
 query.innerHTML='<article class="panel"><div class="panel-head"><h2>账本记录</h2></div><form class="record-filters"><label class="field">开始日期<input name="start" type="date"></label><label class="field">结束日期<input name="end" type="date"></label><label class="field">成员<select name="member"></select></label><label class="field">账户<select name="account"></select></label><label class="field">类型<select name="kind"><option value="">全部类型</option><option value="income">收入</option><option value="transfer">转账</option><option value="balance">余额与估值</option><option value="opening">初始余额</option><option value="historical-income">历史收入汇总</option><option value="historical-assets">历史家庭总资产</option></select></label><button class="outline" type="reset">清除筛选</button></form><p class="muted" role="status"></p><div class="query-rows"></div><button class="outline" type="button" hidden>显示更多</button></article>';
 entry.after(query);
 const form=query.querySelector('form'),controls=query.querySelector('.panel-head'),more=query.querySelector('button[hidden]');
 controls.append(exportButton);exportButton.textContent='导出筛选后的收入 CSV';
 const trash=oldDetails.querySelector('.inline-trash');if(trash){trash.onclick=()=>root.FamilyMaintenance.openTrash('all');controls.append(trash);}
 const types={income:'收入',transfer:'转账',balance:'余额与估值',opening:'初始余额','historical-income':'历史收入汇总','historical-assets':'历史家庭总资产'};
 const lookup=id=>D.accounts.find(a=>a.id===id),accountName=id=>lookup(id)?.name||id||'—';
 let limit=50,matching=[],beforeSave=null,newRecord=null;
 function records(){
  if(!D.live)return [];
  const regular=(D.records||[]).filter(r=>types[r.type]).map(r=>({r,type:r.type,member:r.member||lookup(r.account)?.owner,targetOwner:lookup(r.target)?.owner,id:r.order,editable:r.order>0&&!r.portfolioValuation}));
  return regular.concat((D.history||[]).map(r=>({r,type:'historical-'+r.kind,member:r.member,id:r.key,editable:true,history:true})));
 }
 function list(label,items){
  const wrap=makeReportTable(label,['日期 / 期间','类型','成员','账户','金额','说明','操作'],items.map(({r,type,member,history})=>[history?FamilyHistoryPeriod.label(r):r.date,types[type],member?memberName(member):'—',r.target?accountName(r.account)+' → '+accountName(r.target):accountName(r.account),nativeMoney(r.cents,r.currency||'CNY')+(type==='transfer'&&r.targetCents!=null?' → '+nativeMoney(r.targetCents,r.targetCurrency||r.currency||'CNY'):''),[r.source,r.memo].filter(Boolean).join(' · ')||'—','—']));
  const table=wrap.querySelector('table');table.classList.add('record-table');const trs=table.querySelectorAll('tbody tr');
  if(!items.length)trs[0].firstElementChild.colSpan=7;
  items.forEach(({r,id,editable,history,type},i)=>{
   const tr=trs[i],td=tr.lastElementChild;
   if(!history&&id===newRecord)tr.classList.add('recently-saved');
   if(!editable||root.currentFamilyUser?.role!=='admin')return;
   const M=root.FamilyMaintenance;if(!M)return;const kind=history?'history':'record';td.replaceChildren(M.button('修改',()=>M.edit(kind,id,r)));td.className='record-actions';
   if(type!=='opening'){const menu=document.createElement('details'),toggle=document.createElement('summary');toggle.textContent='更多';menu.append(toggle,M.button('删除',()=>{menu.open=false;M.check({action:history?'delete-history':'delete-record',id});}));td.append(menu);}
  });return wrap;
 }
 function options(field,items,placeholder){const select=form.elements.namedItem(field),value=select.value;select.replaceChildren(new Option(placeholder,''),...items.map(([id,name])=>new Option(name,id)));if(items.some(([id])=>id===value))select.value=value;}
 function drawRecords(reload=false){
  const all=records();
  if(reload){const recentItems=all.filter(x=>!x.history&&x.editable&&['income','transfer'].includes(x.type)).sort((a,b)=>b.id-a.id);
   if(beforeSave){newRecord=recentItems.find(x=>!beforeSave.has(x.id))?.id??null;beforeSave=null;}
   recent.querySelector('.recent-rows').replaceChildren(list('近期收入与转账',recentItems.slice(0,10)));
   const memberKey=new Set([...(D.memberProfiles||[]).map(p=>p.key),...all.flatMap(x=>[x.member,x.targetOwner]).filter(Boolean)]);
   options('member',[...memberKey].map(k=>[k,memberName(k)]),'全部成员');
   options('account',D.accounts.map(a=>[a.id,a.name]),'全部账户');
  }
  const {start,end,member,account,kind}=Object.fromEntries(new FormData(form)),invalid=start&&end&&start>end;
  matching=invalid?[]:all.filter(x=>(!start||x.r.date>=start)&&(!end||(x.r.start||x.r.date)<=end)&&(!member||x.member===member||x.targetOwner===member)&&(!account||x.r.account===account||x.r.target===account)&&(!kind||x.type===kind)).sort((a,b)=>b.r.date.localeCompare(a.r.date)||Number(b.id||0)-Number(a.id||0));
  query.querySelector('[role=status]').textContent=invalid?'开始日期不能晚于结束日期。':'共 '+matching.length+' 条记录，当前显示 '+Math.min(limit,matching.length)+' 条。';
  query.querySelector('.query-rows').replaceChildren(list('筛选后的账本记录',matching.slice(0,limit)));more.hidden=matching.length<=limit;
  exportButton.disabled=!matching.some(x=>x.type==='income'||x.type==='historical-income');
 }
 form.onchange=()=>{limit=50;drawRecords();};form.onreset=()=>setTimeout(()=>{limit=50;drawRecords();});form.onsubmit=e=>e.preventDefault();more.onclick=()=>{limit+=50;drawRecords();};
 const csvCell=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
 exportButton.onclick=()=>{const rows=[['日期或期间','成员','来源','账户','原币','原币金额','折合人民币']];for(const {r,type,history,member}of matching){if(type!=='income'&&type!=='historical-income')continue;rows.push([history?FamilyHistoryPeriod.label(r):r.date,memberName(member),history?'历史收入汇总':r.source,accountName(r.account),r.currency||'CNY',(r.cents/100).toFixed(2),((r.cnyCents??r.cents)/100).toFixed(2)]);}download('收入明细.csv','\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
 window.FamilyRecordLayout={draw:drawRecords};
 document.addEventListener('family-income-saved',()=>{beforeSave=new Set(records().filter(x=>!x.history).map(x=>x.id));recent.open=true;});
 for(const event of ['family-ledger-ready','family-session-ready','family-app-ready'])document.addEventListener(event,()=>drawRecords(true));
 document.documentElement.dataset.navigation='four';
 drawRecords(true);route();
})(globalThis);
