'use strict';
(function(){
  const reportPanel=document.createElement('article');reportPanel.className='panel';reportPanel.id='expenseReportPanel';
  reportPanel.innerHTML=`<div class="panel-head"><div><h2>家庭支出与结余</h2><p>每人每月一个总额，家庭自动合计；跟随日期范围，收入成员筛选不改变家庭支出。</p></div><button class="outline" id="exportExpenses">导出支出 CSV ↗</button></div>
    <div class="expense-kpis"><article><span>期间已录家庭支出</span><strong id="reportExpense"></strong></article><article><span>家庭已录收入减支出</span><strong id="reportNet"></strong></article></div>
    <p class="muted" id="expenseReportNote"></p><h3 class="source-label">家庭月度收支对比 · 人民币</h3><div id="cashflowBars"></div>
    <details><summary>查看每月支出</summary><div class="table-scroll"><table><thead><tr><th>月份</th><th>统计截止日</th><th class="right">家庭净支出</th><th>备注</th></tr></thead><tbody id="expenseReportRows"></tbody></table></div></details>`;
  document.querySelector('[data-page="income"]').append(reportPanel);
  const memberTotals=document.createElement('div');memberTotals.className='expense-kpis';$('expenseReportNote').after(memberTotals);
  const saved=document.createElement('details');saved.className='expense-saved';saved.innerHTML='<summary>查看或修改已保存的月份</summary><div id="savedExpenseMonths"></div>';
  $('monthlyExpensePanel').append(saved);
  const reminder=document.createElement('div');reminder.className='demo-notice';reminder.id='inventoryReminder';document.querySelector('[data-page="overview"]').prepend(reminder);
  const reconciliation=document.createElement('article');reconciliation.className='panel';reconciliation.innerHTML='<div class="panel-head"><div><h2>盘点核对 · 实际余额与账面差额</h2><p>实际余额校准账本，差额保留为未记录净变动，不直接认作消费或投资收益。</p></div></div><div class="table-scroll"><table><thead><tr><th>日期</th><th>账户</th><th class="right">盘点校准差额（原币）</th></tr></thead><tbody id="reconciliationRows"></tbody></table></div>';
  document.querySelector('[data-page="assets"]').append(reconciliation);
  document.querySelector('[data-route="income"] span').textContent='收支统计';
  document.querySelector('a[href="#income"]:not([data-route])').innerHTML='查看家庭收支 <span>进入收支统计 →</span>';
  const monthEnd=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
  const memberFields=document.createElement('div');memberFields.id='memberExpenseFields';memberFields.className='full form-grid';$('expenseTotalField').before(memberFields);$('expenseTotal').required=false;$('expenseTotal').readOnly=true;$('expenseTotalField').firstChild.textContent='家庭支出合计（自动计算）';
  function sumMembers(){let total=0n,complete=true;for(const i of memberFields.querySelectorAll('input')){if(i.value===''){complete=false;continue;}try{const neg=i.value.startsWith('-'),v=(neg?i.value.slice(1):i.value).split('.');if(!/^\d+(\.\d{1,2})?$/.test(neg?i.value.slice(1):i.value))throw Error();total+=(neg?-1n:1n)*(BigInt(v[0])*100n+BigInt((v[1]||'').padEnd(2,'0')));}catch{complete=false;}}$('expenseTotal').value=complete?(Number(total)/100).toFixed(2):'';requestId=FamilyClient.newId();}
  const currentRows=()=> (D.expenseSummaries||[]).filter(s=>s.month===$('expenseMonth').value);
  let revision=0,requestId=FamilyClient.newId(),lastReport,initialized=false;
  function loadMonth(){
    const rows=currentRows(),s=rows.find(s=>s.scope==='household'),existing=rows.find(s=>s.member==='共同'),month=$('expenseMonth').value;
    revision=existing?.revision||0;requestId=FamilyClient.newId();
    memberFields.replaceChildren();for(const p of (D.memberProfiles||[]).filter(p=>p.active||s?.breakdown?.some(b=>b.member===p.key))){const l=document.createElement('label');l.className='field';l.textContent=p.name+' · 本月净支出（人民币）';const i=document.createElement('input');i.type='number';i.step='0.01';i.required=true;i.dataset.expenseMember=p.key;i.placeholder='无支出填0；未填不当作0';const saved=s?.breakdown?.find(b=>b.member===p.key);i.value=saved?(saved.cents/100).toFixed(2):'';i.oninput=sumMembers;l.append(i);memberFields.append(l);}sumMembers();
    $('expenseThrough').value=s?.through||(month?[monthEnd(month),D.today].sort()[0]:D.today);
    $('expenseThrough').min=month+'-01';$('expenseThrough').max=month?[monthEnd(month),D.today].sort()[0]:D.today;
    $('expenseTotalMemo').value=s?.memo||'';
    $('monthlyExpenseStatus').textContent=s?(s.breakdown?'该月已保存，修改后会替换原金额，不会累加。':`该月原有家庭总额 ${money(s.cents)}，无法自动拆给两个人。请核对各自金额后保存；未保存前统计仍保留原总额。`):rows.length?'该月有旧版记录，请核对家庭总额后保存；原始记录保留，新家庭总额将替代旧口径。':'本月尚未填写；两个人分别填月总额，未填写不等于没有支出。';
    $('expenseModeNote').textContent='分别填写两个人退款冲减后的月总额，家庭合计自动相加；同一笔消费只归属一人，包含手续费；不含夫妻互转、信用卡还款、充值、购买股票和理财本金。只参与统计，不再扣账户余额。';
  }
  $('expenseMonth').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()).slice(0,7);$('expenseMonth').max=$('expenseMonth').value;$('expenseMonth').onchange=loadMonth;
  for(const id of ['expenseTotal','expenseThrough','expenseTotalMemo'])$(id).oninput=()=>{requestId=FamilyClient.newId();};
  $('monthlyExpenseForm').onsubmit=async event=>{
    event.preventDefault();if(!D.live){$('monthlyExpenseStatus').textContent='请在本机试用账本4318中保存。';return;}
    const input={requestId,expectedRevision:revision,month:$('expenseMonth').value,amount:$('expenseTotal').value,through:$('expenseThrough').value,memo:$('expenseTotalMemo').value,breakdown:[...memberFields.querySelectorAll('input')].map(i=>({member:i.dataset.expenseMember,amount:i.value}))};
    $('saveMonthlyExpense').disabled=true;
    try{await api('/api/expenses/month',input);await refreshLedger();loadMonth();$('monthlyExpenseStatus').textContent='家庭月度支出已保存，账户余额不变。';}
    catch(e){$('monthlyExpenseStatus').textContent=e.message;}
    finally{$('saveMonthlyExpense').disabled=false;}
  };
  function renderExpenses(r){
    if(D.live&&!initialized){initialized=true;loadMonth();}
    lastReport=r;const e=r.familyExpense;
    memberTotals.replaceChildren();for(const b of e.byMember){const a=document.createElement('article'),label=document.createElement('span'),value=document.createElement('strong');label.textContent=(b.name==='共同'?'未拆分家庭总额':memberName(b.name))+' · 期间已录支出';value.textContent=money(b.cents);a.append(label,value);memberTotals.append(a);}
    const amount=e.hasData?e.unresolved.length?'部分总额无法拆分':money(e.cents):'尚未记录',net=e.cents===null?'—':signed(r.familyIncome-e.cents);
    $('overviewExpense').textContent=$('reportExpense').textContent=amount;$('overviewNet').textContent=$('reportNet').textContent=net;
    let note=e.unresolved.length?`有${e.unresolved.length}份月总额被筛选边界截断，无法精确拆分。可定位小计${money(e.knownCents)}，不是完整区间合计。`:e.hasData?'仅统计已填写月份及其截止日；未填月份不视为0。月总额已包含手续费，不会再次叠加转账手续费。':'尚未填写月度支出，不按0元计算结余。每月录入一个家庭总额即可。';
    if(e.rows.some(x=>x.legacy))note+=' 此范围包含旧版成员总额，可在每月支出中核对并统一为家庭总额。';
    if(e.legacyDetails)note+=' 旧版逐笔记录未纳入新版月总额，请核对后补填对应月份。';
    $('overviewExpenseNote').textContent=$('expenseReportNote').textContent=note;
    const months=new Map();
    for(const row of D.incomes.filter(x=>x.date>=r.start&&x.date<=r.end)){const key=row.date.slice(0,7);if(!months.has(key))months.set(key,{income:0,expense:null});months.get(key).income+=row.cents;}
    for(const row of e.rows){const key=row.month;if(!months.has(key))months.set(key,{income:0,expense:null});months.get(key).expense=(months.get(key).expense||0)+row.cents;}
    const maximum=Math.max(...[...months.values()].flatMap(x=>[Math.abs(x.income),Math.abs(x.expense||0)]),1);
    $('cashflowBars').innerHTML=[...months].sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>`<div class="cashflow-month"><strong>${key}</strong><div><span>家庭收入 ${money(v.income)}</span><div class="track"><div class="fill" style="width:${Math.abs(v.income)/maximum*100}%"></div></div><span>家庭支出 ${v.expense===null?'未填写或无法拆分':money(v.expense)}</span>${v.expense===null?'':`<div class="track"><div class="fill" style="width:${Math.abs(v.expense)/maximum*100}%;background:#b17d4b"></div></div>`}</div></div>`).join('')||'<p class="muted">录入收入或月度支出后显示对比。</p>';
    $('expenseReportRows').innerHTML=e.rows.map(row=>`<tr><td>${row.month}</td><td>${row.through}</td><td class="right">${money(row.cents)}</td><td>${escapeHTML((row.breakdown||[]).map(b=>memberName(b.member)+' '+money(b.cents)).join('；')+(row.memo?' · '+row.memo:''))}${row.legacy?'（旧版总额）':''}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">此范围暂无可完整计入的月度支出</td></tr>';
    $('savedExpenseMonths').replaceChildren();
    const monthsSaved=[...new Set((D.expenseSummaries||[]).map(s=>s.month))].sort().reverse();
    for(const month of monthsSaved){const s=(D.expenseSummaries||[]).find(s=>s.month===month&&s.scope==='household');const button=document.createElement('button');button.className='outline';button.type='button';button.textContent=`${month} · ${s?money(s.cents)+' 截至 '+s.through:'旧版记录待核对家庭总额'} · 修改`;button.onclick=()=>{if($('workflowMonth')){$('workflowMonth').value=month;$('workflowMonth').dispatchEvent(new Event('change'));}else{$('expenseMonth').value=month;loadMonth();}$('monthlyExpensePanel').scrollIntoView({behavior:'smooth',block:'start'});};$('savedExpenseMonths').append(button);}
    const unknown=(D.balances||[]).filter(a=>a.cents===null),stale=(D.balances||[]).filter(a=>a.confirmedDate&&Date.parse(D.today)-Date.parse(a.confirmedDate)>30*86400000);
    $('inventoryReminder').textContent=!D.live?'连接本机账本后可显示盘点提醒。':unknown.length?`待办：${unknown.length}个账户尚无初始余额。请到资产盘点确认，无需开期。`:stale.length?`盘点提醒：${stale.length}个账户超过30天没有确认实际余额。`:'账户初始余额已齐全，定期盘点即可。';
    $('reconciliationRows').innerHTML=(D.adjustments||[]).slice().reverse().slice(0,30).map(a=>`<tr><td>${a.date}</td><td>${escapeHTML(D.accounts.find(x=>x.id===a.account)?.name||a.account)}</td><td class="right">${a.cents===null?'首次确认，无可比余额':nativeMoney(a.cents,a.currency)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">盘点后在此显示核对结果</td></tr>';
  }
  $('exportExpenses').onclick=()=>{
    if(!lastReport)return;const r=lastReport,e=r.familyExpense;
    const csv=value=>{const v=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(v)?"'":'')+v.replaceAll('"','""')+'"';};
    const rows=[['家庭月度支出',r.start,r.end,e.unresolved.length?'部分总额无法拆分，仅导出可完整定位月份':'仅含已填月份'],['月份','截止日','人民币净支出','备注'],...e.rows.map(x=>[x.month,x.through,(x.cents/100).toFixed(2),x.memo||''])];
    download(`家庭支出_${r.start}_${r.end}.csv`,'\uFEFF'+rows.map(x=>x.map(csv).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  };
  globalThis.ExpenseUI={render:renderExpenses};loadMonth();if(current)renderExpenses(current);
})();
