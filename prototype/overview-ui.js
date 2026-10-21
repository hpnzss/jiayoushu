'use strict';
(function(root){
 const views=['summary','asset-analysis','income'];
 function select(requested,saved){return requested==='details'?'income':requested==='trend'?'summary':views.includes(requested)?requested:views.includes(saved)?saved:'summary';}
 function incomeSummary(report,today){const month=report(today.slice(0,7)+'-01',today),year=report(today.slice(0,4)+'-01-01',today);const provident=r=>r.rows.filter(x=>x.category==='公积金'||/公积金/.test(x.source||'')).reduce((sum,x)=>sum+x.cents,0);return {month:month.income,year:year.income,monthFund:provident(month),yearFund:provident(year),partial:month.partialHistory||year.partialHistory};}
 if(typeof module!=='undefined'&&module.exports){module.exports={select,incomeSummary};return;}
 const overview=document.querySelector('[data-page=overview]'),income=document.querySelector('[data-page=income]');
 const tabs=document.createElement('nav');tabs.className='overview-tabs';tabs.setAttribute('aria-label','家庭概况分析标签');
 const panes={};for(const [key,label]of [['summary','概览'],['asset-analysis','资产分析'],['income','收入分析']]){const a=document.createElement('a');a.href='#'+key;a.textContent=label;a.dataset.overviewTab=key;tabs.append(a);const pane=key==='income'?income:document.createElement('section');pane.id='overview-'+key;pane.setAttribute('aria-label',label);panes[key]=pane;}
 // Move existing panels rather than cloning IDs, listeners or filter state.
 const summary=panes.summary,assets=panes['asset-analysis'];
 // Keep moved panels connected so existing ID lookups and listeners remain valid.
 overview.append(summary,assets);
 summary.append($('overviewMetrics'),$('trend'));
 const legacy=document.createElement('div');legacy.hidden=true;legacy.id='overviewCompatibility';legacy.append($('overview-types'),$('overview-currencies'),$('incomeValue').closest('article'));
 assets.append($('asset-types'),$('asset-currencies'));
 const incomeCard=document.createElement('article');incomeCard.className='panel overview-income-card';incomeCard.innerHTML='<div class="panel-head"><div><h2>近期家庭收入</h2><p>包含公积金；内部转账不算收入。</p></div><a class="outline" href="#income">查看收入分析 →</a></div><div class="overview-income-totals"><div><span>本月收入</span><strong id="overviewMonthIncome"></strong><small id="overviewMonthFund"></small></div><div><span>今年累计收入</span><strong id="overviewYearIncome"></strong><small id="overviewYearFund"></small></div></div><p class="muted" id="overviewIncomeNote"></p>';
 summary.prepend(incomeCard);const quick=overview.querySelector('.quick-links');if(quick)summary.append(quick);
 const overviewNote=overview.querySelector(':scope > p.demo-notice');if(overviewNote)summary.prepend(overviewNote);
 overview.prepend(tabs);overview.append(summary,assets,income,legacy);
 $('overviewMetrics').querySelector('h2').textContent='家庭资产概况';$('overviewMetrics').querySelector('.panel-head p').textContent='显示所选结束日以前最近的家庭资产记录，具体日期见金额下方。';
 document.querySelector('nav[aria-label=主导航] [data-route=income]')?.remove();
 document.querySelector('[data-route=overview] span').textContent='家庭概况';
 document.querySelector('[data-route=settings] span').textContent='设置';
 document.documentElement.dataset.navigation='four';
 const storageKey=()=> 'family-overview-tab:'+location.origin+':'+(root.currentFamilyUser?.member||'anonymous');
 function saved(){try{return localStorage.getItem(storageKey());}catch{return null;}}
 function show(requested){if(!['overview','summary','asset-analysis','income','details','trend',''].includes(requested))return;
  const active=select(requested,saved());overview.hidden=false;for(const [key,pane]of Object.entries(panes))pane.hidden=key!==active;
  for(const a of tabs.querySelectorAll('a')){const chosen=a.dataset.overviewTab===active;a.classList.toggle('active',chosen);if(chosen)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  try{localStorage.setItem(storageKey(),active);}catch{}
  $('export').hidden=active!=='income';
  requestAnimationFrame(()=>{render();root.FamilyIncomeCharts?.render();root.FamilyAssetDistribution?.render();});
 }
 function refresh(){const s=incomeSummary((start,end)=>D.report(start,end),D.today);$('overviewMonthIncome').textContent=money(s.month);$('overviewYearIncome').textContent=money(s.year);$('overviewMonthFund').textContent='其中公积金 '+money(s.monthFund);$('overviewYearFund').textContent='其中公积金 '+money(s.yearFund);$('overviewIncomeNote').textContent='截至 '+D.today+' · 仅统计已录收入，未记录不代表为零。'+(s.partial?'部分历史合计跨越当前范围，未拆分计入。':'');}
 root.FamilyOverview={show,refresh};for(const event of ['family-ledger-ready','family-session-ready','family-app-ready'])document.addEventListener(event,refresh);
 document.addEventListener('family-session-ready',()=>{if(location.hash==='#overview')show('overview');});
 refresh();route();
})(globalThis);
