'use strict';
const D = FamilyReport;
const $ = id => document.getElementById(id);
const money = cents => cents === null ? '资料不足' : '¥' + (cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const signed = cents => cents === null ? '资料不足' : (cents > 0 ? '+' : cents < 0 ? '−' : '') + money(Math.abs(cents));
const nativeMoney=(cents,currency='CNY')=>cents===null?'资料不足':`${currency} ${(cents/100).toLocaleString('zh-CN',{maximumFractionDigits:2})}`;
const colors = ['#24634e', '#7c9b79', '#c6a55d', '#bbcab0'];
const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const memberName=key=>D.memberName?D.memberName(key):key;
let mode = 'year', member = '全家', current;
function preset() {
  if(window.FamilyPanelFilters){render();return;}
  const p = $('period');
  if (mode === 'month') {
    if (!p.value) return;
    const [y, m] = p.value.split('-').map(Number);
    if (!y || !m) return;
    $('start').value = p.value + '-01';
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    $('end').value = p.value + '-' + String(last).padStart(2, '0');
  } else if (mode === 'year') {
    const y = Number(p.value);
    if (y < 2000 || y > 2100) return;
    $('start').value = `${y}-01-01`; $('end').value = `${y}-12-31`;
  }
  if ($('start').value <= D.today && $('end').value > D.today) $('end').value = D.today;
  render();
}
function render() {
  try { current = FamilyPanelFilters.report('income-details',member); $('error').textContent = ''; }
  catch (e) { $('error').textContent = e.message; $('export').disabled = $('chartExport').disabled = true; return; }
  $('export').disabled = $('chartExport').disabled = false;
  const r = FamilyPanelFilters.report('overview-metrics'),summary=FamilyPanelFilters.report('income-summary'),compositionReport=FamilyPanelFilters.report('income-composition');
  $('range').textContent = `${r.start} — ${r.end}${r.end === D.today ? (D.live ? ' · 截至今日' : ' · 截至演示数据日') : ''}`;
  $('assetValue').textContent = r.closing ? money(D.total(r.closing)) : '资料不足';
  $('assetDate').textContent = r.closing ? `${r.closing.historical?'历史家庭总额':r.closing.kind==='estimated'?'部分盘点或流水推算':'完整盘点'}：${r.closing.date}${r.closing.date < r.end ? ' · 沿用历史记录' : ''}` : '资料不足：请先确认每个账户的初始余额';
  $('incomeTitle').textContent = '期间家庭收入';
  $('incomeValue').textContent = money(r.income);
  $('reportIncomeLabel').textContent = '期间家庭收入';
  $('reportIncomeValue').textContent = money(summary.income);
  incomeTrend(r);
  chart(FamilyPanelFilters.report('asset-trend'));
  globalThis.FamilyIncomeComposition?.render();
  const sources = Object.create(null);
  compositionReport.rows.forEach(x => {const category=x.category==='其他'?x.source:x.category||FamilyClient.incomeCategory(x.source);sources[category]=(sources[category]||0)+x.cents;});
  $('sources').innerHTML = Object.keys(sources).length ? '<div class="source-chips">' + Object.entries(sources).map(([k,v]) => `<span class="chip">${escapeHTML(k)} ${money(v)}</span>`).join('') + '</div>' : '<p class="muted">所选区间没有收入记录。</p>';
  const latest = D.snapshots.at(-1);
  $('distributionDate').textContent = D.live?'当前账面余额；未确认初始余额的账户显示“资料不足”':`采用 ${latest.date} 的完整盘点，与报告筛选独立`;
  const balances=D.live?D.balances:D.accounts.map((a,i)=>({...a,cents:latest.amounts[i],confirmedDate:latest.date}));
  const total = balances.every(b=>b.cents!==null)?balances.reduce((s,b)=>s+b.cents,0):null;
  $('distribution').innerHTML = total>0 && balances.every(b=>b.cents>=0)?'<div class="stack">' + balances.map((b,i) => `<span style="width:${b.cents / total * 100}%;background:${colors[i%colors.length]}" title="${escapeHTML(b.name)} ${money(b.cents)}"></span>`).join('') + '</div>':'';
  $('accountRows').innerHTML = balances.map((b,i) => `<div class="account-row"><div><span class="dot" style="background:${colors[i%colors.length]}"></span>${escapeHTML(b.name)}<small>${escapeHTML(memberName(b.owner))} · ${b.confirmedDate?'最近确认 '+b.confirmedDate:'初始余额待确认'}${b.currency?' · '+escapeHTML(b.currency):''}</small>${b.currency&&b.currency!=='CNY'?`<small>${nativeMoney(b.nativeCents,b.currency)} · 汇率日 ${b.fx?.date||'未知'}</small>`:''}</div><div>${money(b.cents)}<small>${total>0?(b.cents/total*100).toFixed(1)+'%':'尚无完整占比'}</small></div></div>`).join('');
  $('rowCount').textContent = `${member} · ${current.rows.length} 笔`;
  $('incomeRows').innerHTML = current.rows.length ? current.rows.slice().reverse().map(x => `<tr><td>${x.historical?FamilyHistoryPeriod.label(x):x.date}</td><td>${escapeHTML(memberName(x.member))}</td><td>${escapeHTML(x.source)}</td><td>${escapeHTML((x.historical?'历史汇总（不关联账户）':D.accounts.find(a => a.id === x.account)?.name||'未知账户'))}</td><td class="right">${money(x.cents)}${x.nativeCents!==undefined?`<small class="muted" style="display:block">${nativeMoney(x.nativeCents,x.currency)} · 汇率日 ${x.fx.date}</small>`:''}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">所选区间没有收入记录</td></tr>';
  globalThis.FamilyAssetReminders?.render();
  globalThis.FamilyWorkflow?.renderReportStatus(r);globalThis.FamilyDashboard?.render();globalThis.FamilyHistory?.renderStatus(r);
}
const assetViewport={signature:null,window:null,points:[],amountAll:false};
function chart(r) {
  assetViewport.report=r;
  const allPoints = [...(r.opening ? [r.opening] : []), ...r.points].filter(p=>!(D.hiddenSnapshotDates||[]).includes(p.date));
  const signature=r.start+'|'+r.end+'|'+allPoints.length;if(signature!==assetViewport.signature){assetViewport.signature=signature;assetViewport.window=null;window.FamilyAssetNavigation?.reset();}assetViewport.points=allPoints;
  const pts=assetViewport.window?allPoints.slice(assetViewport.window[0],assetViewport.window[1]+1):allPoints;
  window.FamilyAssetNavigation?.update();
  if (!pts.length) { $('assetChart').innerHTML = '<div class="empty">此区间及此前没有可用资产记录</div>'; $('chartNote').textContent = ''; return; }
  const measuredWidth=$('assetChart').getBoundingClientRect().width;if(!measuredWidth)return;
  const w = (assetViewport.amountAll&&FamilyPanelFilters.numbers('asset-trend'))?Math.max(280,Math.round(measuredWidth),pts.length*110+80):Math.max(280,Math.round(measuredWidth)), h = measuredWidth<520?240:280, left = 64, right = 16, top = 20, bottom = 34;
  const vals=pts.map(D.total),axis=window.FamilyAssetNavigation?.scale(vals)||FamilyChartAxis.scale(vals),low=axis.min,high=axis.max;
  const firstTime = Date.parse(pts[0].date), lastTime = Date.parse(pts.at(-1).date);
  const x = i => firstTime === lastTime ? (w + left) / 2 : (assetViewport.amountAll&&FamilyPanelFilters.numbers('asset-trend'))?left+i*(w-left-right)/Math.max(pts.length-1,1):left + (Date.parse(pts[i].date) - firstTime) / (lastTime - firstTime) * (w-left-right);
  const y = v => top + (high - v) / (high-low) * (h-top-bottom);
  let content = `<rect width="${w}" height="${h}" fill="transparent"/>`;
  for(const v of axis.ticks) { const yy = y(v); content += `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e8ede3"/><text x="${left-12}" y="${yy+4}" text-anchor="end" fill="#718078" font-size="11">${Math.abs(v)>=1000000?(v/1000000).toLocaleString('zh-CN',{maximumFractionDigits:4})+'万':(v/100).toLocaleString('zh-CN',{maximumFractionDigits:2})}</text>`; }
  content+=`<defs><clipPath id="asset-plot-clip"><rect x="${left-4}" y="${top}" width="${w-left-right+8}" height="${h-top-bottom}"/></clipPath></defs><g clip-path="url(#asset-plot-clip)">`;
  for(let i=1;i<pts.length;i++) content += `<line x1="${x(i-1)}" y1="${y(vals[i-1])}" x2="${x(i)}" y2="${y(vals[i])}" stroke="var(--accent,#24634e)" stroke-width="2" ${i === 1 && r.opening ? 'stroke-dasharray="6 5"' : ''}/>`;
  let lastLabelX=-Infinity;
  pts.forEach((p,i) => { content += `<circle cx="${x(i)}" cy="${y(vals[i])}" r="3" fill="${i===0 && r.opening ? '#c6a55d' : '#24634e'}" stroke="var(--surface,white)" stroke-width="1.5"><title>${p.date} ${money(vals[i])}${i===0 && r.opening ? '（期初参考）' : p.historical?'（历史家庭总额）':''}</title></circle>`; if((x(i)-lastLabelX>=100&&x(pts.length-1)-x(i)>=80)||i===pts.length-1){lastLabelX=x(i);content += `</g><text x="${x(i)}" y="${h-12}" text-anchor="${i===0 ? 'start' : i===pts.length-1 ? 'end' : 'middle'}" fill="#718078" font-size="11">${lastTime-firstTime>366*86400000?p.date.slice(0,7):p.date.slice(5)}</text><g clip-path="url(#asset-plot-clip)">`;} });
  const valuePoints=pts.map((p,i)=>({x:x(i),y:y(vals[i]),text:FamilyChartLabels.money(vals[i]),color:'var(--accent)',family:true,last:i===pts.length-1}));content+='</g>'+FamilyChartLabels.lineSVG(valuePoints,{left:left+2,right:w-right-2,top:4,bottom:h-bottom-3,all:(assetViewport.amountAll&&FamilyPanelFilters.numbers('asset-trend'))});$('assetChart').classList.toggle('all-amounts',(assetViewport.amountAll&&FamilyPanelFilters.numbers('asset-trend'))); $('assetChart').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" style="${(assetViewport.amountAll&&FamilyPanelFilters.numbers('asset-trend'))?'width:'+w+'px;max-width:none;height:'+h+'px':''}" role="img" aria-label="${r.start} 至 ${r.end} 家庭资产趋势，金额单位人民币元"><title>家庭资产趋势 ${r.start} 至 ${r.end}（${D.live?'本机账本':'演示数据'}）</title>${content}</svg>`;
  $('chartNote').textContent = `${r.points.length} 个区间内记录${r.opening ? `，期初参考 ${r.opening.date}` : '，无期初参考'}。金额直接标注；密集时可放大或选择“全部金额”横向滑动（按记录点等距展开）。${D.live?'历史家庭总额为独立记录点，不代表各银行卡余额；其余点可能沿用旧盘点或由流水推算。连线不代表两点间每日资产。':'连线仅帮助阅读，不代表两点之间的每日实际余额。'}`;
}
window.addEventListener('hashchange',()=>requestAnimationFrame(()=>{if(assetViewport.report)chart(assetViewport.report);}));
if(typeof ResizeObserver!=='undefined'){let priorWidth=0;new ResizeObserver(entries=>{const width=Math.round(entries[0].contentRect.width);if(width>0&&width!==priorWidth){priorWidth=width;if(assetViewport.report)chart(assetViewport.report);}}).observe($('assetChart'));}
function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function incomeTrend(r) {
  const days = (Date.parse(r.end) - Date.parse(r.start)) / 86400000 + 1;
  const daily = days <= 31, yearly = days > 1100;
  const groups = new Map();
  const cursor = new Date(r.start + 'T00:00:00Z');
  if (yearly) cursor.setUTCMonth(0, 1);
  else if (!daily) cursor.setUTCDate(1);
  while (cursor.toISOString().slice(0,10) <= r.end && groups.size < 100) {
    const key = cursor.toISOString().slice(0, yearly ? 4 : daily ? 10 : 7);
    groups.set(key, 0);
    if (yearly) cursor.setUTCFullYear(cursor.getUTCFullYear()+1);
    else if (daily) cursor.setUTCDate(cursor.getUTCDate()+1);
    else cursor.setUTCMonth(cursor.getUTCMonth()+1);
  }
  r.rows.forEach(x => { const key = x.date.slice(0, yearly ? 4 : daily ? 10 : 7); groups.set(key, (groups.get(key)||0)+x.cents); });
  const max = Math.max(...groups.values(), 1);
  $('incomeTrendNote').textContent = `${member} · 按${yearly ? '年' : daily ? '日' : '月'}显示，仅计算所选起止日期内的收入；零收入期间也保留。`;
  const list = document.createElement('div'); list.className = 'income-columns';
  for (const [date, cents] of groups) {
    const col = document.createElement('div'); col.className = 'income-column';
    const label = document.createElement('span'); label.textContent = money(cents);
    const track = document.createElement('div'); track.className = 'column-track';
    const bar = document.createElement('div'); bar.className = 'column-fill'; bar.style.height = `${cents/max*100}%`; track.append(bar);
    const caption = document.createElement('small'); caption.textContent = daily ? date.slice(5) : date;
    col.append(label, track, caption); list.append(col);
  }
  $('incomeTrend').replaceChildren(list);
}
$('export').onclick = () => {
  const csv = v => {const s=String(v);return '"'+(/^[=+\-@\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';};
  const lines = [[D.live?'本机账本 · 收入明细':'虚拟数据 · 收入明细', current.start, current.end, member], ['日期','归属成员','来源','到账账户','折合人民币','原币','原币金额','参考汇率','汇率日期'], ...current.rows.map(x => [x.date,x.member,x.source,(x.historical?'历史汇总（不关联账户）':D.accounts.find(a => a.id === x.account)?.name||'未知账户'),(x.cents/100).toFixed(2),x.currency||'CNY',((x.nativeCents??x.cents)/100).toFixed(2),x.fx?.rate||'1',x.fx?.date||x.date])];
  download(`收入报告_${current.start}_${current.end}.csv`, '\uFEFF' + lines.map(row => row.map(csv).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
};
$('chartExport').onclick = () => {
  const svg = $('assetChart').querySelector('svg');
  if (svg) download(`家庭资产趋势_${assetViewport.report.start}_${assetViewport.report.end}.svg`, svg.outerHTML, 'image/svg+xml;charset=utf-8');
};
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  mode = b.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
  const p = $('period'); $('periodLabel').hidden = mode === 'custom';
  if (mode === 'month') { $('periodLabel').firstChild.textContent = '月份 '; p.type = 'month'; p.removeAttribute('min'); p.removeAttribute('max'); p.value = '2026-10'; }
  if (mode === 'year') { $('periodLabel').firstChild.textContent = '年份 '; p.type = 'number'; p.min = '2020'; p.max = '2100'; p.value = '2026'; }
  $('start').disabled = $('end').disabled = mode !== 'custom';
  preset();
});
document.querySelectorAll('[data-member]').forEach(b => b.onclick = () => { member = b.dataset.member; document.querySelectorAll('[data-member]').forEach(x => x.classList.toggle('active', x === b)); render(); });
$('period').onchange = preset;
$('start').onchange = $('end').onchange = render;
$('start').disabled = $('end').disabled = true;
preset();

// 页面导航：只显示当前版面，兼容旧原型的曲线和明细链接。
const pageInfo = {
  overview: ['家庭概况','看见家庭的每一步积累。','概览、资产与收入，按需切换查看。'],
  entry: ['智能录入','把记录变得轻松一点。','文字、截图和手动填写，最后都由你确认。'],
  income: ['收入统计','各自的努力，一起的积累。','查看成员与家庭收入，按月、按年和自选时间汇总。'],
  assets: ['资产盘点','钱在哪里，心里有数。','定期确认实际余额，让家庭资产更贴近真实情况。'],
  settings: ['设置与备份','为家庭数据留一份安心。','家庭成员、AI 服务和备份，在这里统一管理。']
};
function route() {
  const requested = location.hash.slice(1);
  const alias = {trend:'overview',accounts:'assets',details:'overview',income:'overview',summary:'overview','asset-analysis':'overview'};
  const key = alias[requested] || (pageInfo[requested] ? requested : 'overview');
  if (requested !== key && !['summary','asset-analysis','income','details','trend'].includes(requested)) history.replaceState(null,'','#'+key);
  document.querySelectorAll('[data-page]').forEach(p => p.hidden = p.dataset.page !== key);
  document.querySelectorAll('[data-route]').forEach(a => { const active = a.dataset.route === key; a.classList.toggle('active',active); if(active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  $('pageEyebrow').textContent = 'FAMILY FINANCE / ' + pageInfo[key][0];
  $('pageTitle').textContent = pageInfo[key][1]; $('pageSubtitle').textContent = pageInfo[key][2];
  $('reportControls').hidden = true;
  $('export').hidden = key !== 'income';
  window.FamilyOverview?.show(requested);
  document.title='家有数';
  window.scrollTo(0,0);
  if(key==='settings'&&D.live)loadFx();
}
window.addEventListener('hashchange',route);

const accountSelects = ['recordAccount','targetAccount','balanceAccount'];
accountSelects.forEach(id => D.accounts.forEach(a => { const o = document.createElement('option'); o.value=a.id; o.textContent=`${memberName(a.owner)} · ${a.name}`; $(id).append(o); }));
$('targetAccount').value = 'b';
let draft = null, confirmedDrafts = [], imageUrl, pendingImport=null, saving=false;
function showDraft(records, description) {
  pendingImport=null;
  draft = records;
  const summary = document.createElement('p'); summary.textContent=description;
  const list = document.createElement('ul'); list.className='draft-list';
  records.forEach(record => { const li=document.createElement('li'); li.textContent=record.summary; list.append(li); });
  $('draftContent').className=''; $('draftContent').replaceChildren(summary,list);
  $('draftActions').hidden=false; $('draftStatus').textContent=D.live?'尚未确认，核对后才会写入本机账本。':'尚未确认。原型只保留本次操作，不写入正式账本。';
}
$('sampleDraft').onclick = () => {
  $('naturalText').value='2026年10月15日，成员一工资到账15000元，进招行工资卡，招行现在有62000元。';
  showDraft([
    {type:'income',date:D.today,member:'成员一',account:'a',cents:1500000,source:'工资',summary:'收入：2026-10-15，成员一，工资 ¥15,000，到账招商银行 · 工资卡。'},
    {type:'balance',date:D.today,account:'a',cents:6200000,summary:'余额确认：同日到账后，招商银行 · 工资卡实际余额 ¥62,000；不会再加一次工资。'}
  ],'固定示例，展示“收入＋最终余额”的确认方式，未调用 AI。');
};
$('recordKind').onchange = () => {
  const kind=$('recordKind').value;
  $('memberField').hidden=$('sourceField').hidden=kind!=='income';
  $('recordSource').required=kind==='income';
  $('targetField').hidden=kind!=='transfer';
  $('accountLabel').textContent=kind==='transfer'?'转出账户':kind==='balance'?'盘点账户':'到账账户';
  $('amountLabel').textContent=kind==='balance'?'实际余额（元）':'金额（元）';
  $('recordAmount').min=kind==='balance'?'0':'0.01';
  updateRecordFields();
};
$('manualForm').onsubmit = async event => {
  event.preventDefault();
  const kind=$('recordKind').value, account=$('recordAccount').value, target=$('targetAccount').value;
  const cents=Math.round(Number($('recordAmount').value)*100);
  if (!Number.isSafeInteger(cents) || cents<0 || (kind!=='balance' && cents===0)) { $('draftStatus').textContent='请输入有效金额。'; return; }
  if(kind==='transfer' && account===target) { $('draftContent').textContent='转出与转入账户不能相同。请修改账户后重新生成。'; $('draftActions').hidden=true; draft=null; return; }
  const selectedAccount=D.accounts.find(x=>x.id===account);if(!selectedAccount){$('draftStatus').textContent='请先到“账户与资产”建立资金账户。';return;}
  const a=selectedAccount.name,b=D.accounts.find(x=>x.id===target)?.name||'';
  const date=$('recordDate').value, who=$('recordMember').value, source=$('recordSource').value.trim();
  if(kind==='income'&&!source) { $('recordSource').setCustomValidity('请填写收入来源'); $('recordSource').reportValidity(); return; }
  $('recordSource').setCustomValidity('');
  const memo=$('recordMemo').value.trim();
  const summary=kind==='income'?`收入：${date}，${memberName(who)}，${source} ${money(cents)}，到账${a}。`:kind==='transfer'?`内部转账：${date}，从${a}转入${b}，${money(cents)}；家庭收入不增加，总资产不变（本示例无手续费）。`:`余额盘点：${date}，${a}实际余额 ${money(cents)}；与此前推算余额的差额待正式账本计算。`;
  const record={type:kind,date,account,...($('recordTime').value?{time:$('recordTime').value}:{}),...(kind==='transfer'?{target}:{}),...(kind==='income'?{member:who,source}:{}),cents,memo,summary:summary+(memo?` 备注：${memo}`:'')};
  if(kind==='transfer'){record.feeCents=Math.round(Number($('recordFee').value||0)*100);if(!$('targetAmountField').hidden)record.targetCents=Math.round(Number($('recordTargetAmount').value)*100);}
  if($('recordFxMode').value==='manual'){
    const currency=(D.legacyAccounts||D.accounts).find(a=>a.id===account)?.currency||'CNY';
    const targetCurrency=(D.legacyAccounts||D.accounts).find(a=>a.id===target)?.currency||'CNY';
    const common={date:$('recordRateDate').value,source:$('recordRateSource').value.trim()};
    if(currency!=='CNY')record.fx={...common,rate:$('recordRate').value};
    if(kind==='transfer'&&targetCurrency!=='CNY'&&targetCurrency!==currency)record.targetFx={...common,rate:$('targetRate').value};
  }
  if(D.live){try{await previewEnvelope(envelope([record]));}catch(e){$('draftStatus').textContent=e.message;}return;}
  showDraft([record],'手动填写的演示草稿，请核对后确认。');
};
$('recordSource').oninput=()=> $('recordSource').setCustomValidity('');
$('confirmDraft').onclick=async()=> {
  if(!draft||saving)return;
  if(D.live){
    if(!pendingImport){$('draftStatus').textContent='这是固定演示草稿，不写入账本。请使用粘贴导入或手动填写生成可保存的草稿。';return;}
    saving=true; $('confirmDraft').disabled=true;
    try{
      const result=await api('/api/import/commit',['portfolio','ledger-v2'].includes(pendingImport.kind)?{...pendingImport,acknowledgeDuplicate:$('duplicateAck')?.checked===true}:{data:pendingImport.data,digest:pendingImport.digest,acknowledgeDuplicate:$('duplicateAck')?.checked===true});
      draft=null; pendingImport=null; $('draftActions').hidden=true;
      $('draftStatus').textContent=result.alreadyImported?'这个批次已经保存过，本次没有重复写入。':`已保存 ${result.count} 条记录。刷新后仍保留；收入统计和账户余额已更新。`;
      await refreshLedger();
    }catch(e){$('draftStatus').textContent=e.message+' 可以重试，同一批次不会重复保存。';}
    finally{saving=false;$('confirmDraft').disabled=false;}
    return;
  }
  confirmedDrafts.push(...draft); draft=null; $('draftActions').hidden=true; $('draftStatus').textContent=`已确认演示草稿。本次共确认 ${confirmedDrafts.length} 条，刷新清空；报告中的示例余额和收入未改变。`;
};
$('discardDraft').onclick=()=> { draft=null; $('draftContent').className='empty'; $('draftContent').textContent='草稿已放弃，可以重新填写。'; $('draftActions').hidden=true; $('draftStatus').textContent=''; };
$('screenshotInput').onchange=()=> {
  if(imageUrl)URL.revokeObjectURL(imageUrl);
  const file=$('screenshotInput').files[0]; $('imagePreview').hidden=true;
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){$('imageNote').textContent='请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片。';return;}
  imageUrl=URL.createObjectURL(file); $('imagePreview').src=imageUrl; $('imagePreview').hidden=false; $('imageNote').textContent=`已选择 ${file.name}，仅本机预览，尚未识别。`;
};
$('balanceForm').onsubmit=async event=>{
  event.preventDefault();
  if(D.live){try{await previewEnvelope(envelope([{type:'balance',date:$('balanceDate').value,account:$('balanceAccount').value,cents:Math.round(Number($('balanceAmount').value)*100)}]));location.hash='entry';}catch(e){$('balanceResult').textContent=e.message;}return;}
  const idx=D.accounts.findIndex(a=>a.id===$('balanceAccount').value), latest=D.snapshots.at(-1), cents=Math.round(Number($('balanceAmount').value)*100);
  if(!Number.isSafeInteger(cents)||cents<0)return;
  $('balanceResult').className='balance-preview';
  $('balanceResult').textContent=`盘点日期 ${$('balanceDate').value}：${D.accounts[idx].name}由示例余额 ${money(latest.amounts[idx])}校准为 ${money(cents)}，差额 ${signed(cents-latest.amounts[idx])}。若其他账户保持不变，试算家庭总资产为 ${money(D.total(latest)-latest.amounts[idx]+cents)}。此差额不自动认作消费或收益，试算未保存。`;
};
$('snapshotRows').innerHTML=D.snapshots.slice().reverse().map(s=>`<tr><td>${s.date}</td><td>全部 ${D.accounts.length} 个账户</td><td class="right">${money(D.total(s))}</td></tr>`).join('');
$('aiProvider').onchange=()=> { $('providerNote').textContent=$('aiProvider').value==='OpenAI API'?'方案预览：正式接入需要 API 密钥与独立计费。当前未连接，也不会发送数据。':$('aiProvider').value==='其他兼容服务'?'方案预览：正式版本将支持配置服务地址与模型。当前未连接。':'目前不会发起任何 AI 请求；免费服务的模型效果与数据条款待核对。'; };
$('backupExport').onclick=()=> download(D.live?'家有数_本机数据.json':'家有数_示例备份.json',JSON.stringify({format:D.live?'family-assets-local-export':'family-assets-demo',version:1,createdAt:new Date().toISOString(),accounts:D.accounts,incomes:D.incomes,snapshots:D.snapshots,confirmedDrafts,...(D.live?{records:D.records,adjustments:D.adjustments,portfolio:D.portfolio}: {})},null,2),'application/json;charset=utf-8');
$('backupImport').onchange=async()=>{
  const file=$('backupImport').files[0]; if(!file)return;
  if(file.size>2*1024*1024){$('backupStatus').textContent='文件超过原型检查范围（2 MB），未读取。';return;}
  try{
    const b=JSON.parse(await file.text());
    if(!['family-assets-demo','family-assets-local-export'].includes(b.format)||b.version!==1||!Array.isArray(b.accounts)||!Array.isArray(b.incomes)||!Array.isArray(b.snapshots)||!Array.isArray(b.confirmedDrafts))throw Error('格式不匹配');
    $('backupStatus').textContent=`基础格式检查通过：${b.accounts.length} 个账户、${b.incomes.length} 条收入、${b.snapshots.length} 个资产状态。未执行恢复；正式恢复还需要字段、引用关系和余额一致性验证。`;
  }catch{$('backupStatus').textContent='无法识别此文件。请选择本软件导出的 JSON，账本未发生变化。';}
};
function envelope(rows) {
  return {format:'family-assets-import',version:2,batchId:FamilyClient.newId(),records:rows.map(r=>({type:r.type,date:r.date,account:r.account,amount:(r.cents/100).toFixed(2),...(r.time?{time:r.time}:{}),...(r.member?{member:r.member,source:r.source}:{}),...(r.target?{target:r.target,fee:((r.feeCents||0)/100).toFixed(2),...(r.targetCents!==undefined?{targetAmount:(r.targetCents/100).toFixed(2)}:{})}:{}),...(r.fx?{fx:r.fx}:{}),...(r.targetFx?{targetFx:r.targetFx}:{}),...(r.type==='expense'?{category:r.category,refund:r.refund,affectsBalance:r.affectsBalance}:{}),...(r.memo?{memo:r.memo}:{})}))};
}
async function api(url,data) {
  const res=await fetch(url,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});
  let result;try{result=await res.json();}catch{throw Error('账本服务未连接，请打开本机试用版地址。');}
  if(res.status===401){location.replace('/login?expired');throw Error('请重新登录。');}
  if(!res.ok)throw Error(result.error||'请求未完成');return result;
}
let fxLoading=false;
async function loadFx(force=false) {
  if(fxLoading)return;
  if(!D.live){$('fxStatus').textContent='当前为静态预览，自动汇率请在本机账本中使用。';return;}
  fxLoading=true;$('fxRefresh').disabled=true;$('fxStatus').textContent='正在检查自动汇率，请稍候…';
  try{
    const result=await api(force?'/api/fx/refresh':'/api/fx',force?{}:undefined);
    const q=result.quote;
    $('fxStatus').textContent=!q?'暂时没有可用汇率。'+(result.lastError||'等待自动获取。'):result.status==='stale'?'正在使用缓存汇率。'+(result.lastError||'报价距今较久，请核对日期。'):'自动汇率可用。引用的是来源最近发布的数据，并非实时成交价。';
    $('fxMeta').textContent=q?`来源：${q.source} · 汇率日期：${q.rateDate} · 获取时间：${new Date(q.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（上海时间）`:'';
    $('fxRows').replaceChildren();
    if(q){
      const preferred=['CNY','USD','EUR','HKD','JPY','GBP','SGD','CAD','AUD'];
      const codes=[...preferred.filter(c=>Object.hasOwn(q.toCny,c)),...Object.keys(q.toCny).filter(c=>!preferred.includes(c)).sort()];
      for(const c of codes){const row=document.createElement('tr'),name=document.createElement('td'),rate=document.createElement('td');name.textContent=c;rate.className='right';rate.textContent='¥'+q.toCny[c].toFixed(6);row.append(name,rate);$('fxRows').append(row);}
    }else{const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=2;cell.className='empty';cell.textContent='汇率缺失时不会假定汇率进行折算';row.append(cell);$('fxRows').append(row);}
  }catch(e){$('fxStatus').textContent='汇率服务暂时无法连接：'+e.message;}
  finally{fxLoading=false;$('fxRefresh').disabled=false;}
}
$('fxRefresh').onclick=()=>loadFx(true);
async function previewEnvelope(data) {
  if(!D.live)throw Error('当前是静态原型，尚未连接可保存的账本。请打开本机试用版。');
  pendingImport=null;draft=null;$('draftActions').hidden=true;
  const p=await api('/api/import/preview',{data});
  const rows=p.kind==='portfolio'?p.prepared.rows.map(r=>({...r,summary:`${r.date} · ${memberName(r.asset.owner)} · ${r.asset.name} · ${r.asset.kind==='rsu'?'待归属RSU（不计入主要资产）':r.asset.kind==='cash'?'原币余额':'股票持仓'} ${r.asset.currency} ${(r.nativeCents/100).toLocaleString('zh-CN')} ≈ ${money(r.cnyCents)}；汇率 ${r.fx.rate}（${r.fx.date}，${r.fx.source}）${r.quantity!==undefined?`；${r.quantity}股 × ${r.price}，价格日期 ${r.priceDate}`:''}`})):p.rows.map(r=>{
    const a=D.accounts.find(a=>a.id===r.account).name;
    const unit=r.currency||'CNY',fxNote=r.fx?`；参考汇率 ${r.fx.rate}（${r.fx.date}）`:'';
    const summary=r.type==='expense'?'':r.type==='income'?`${r.date} · ${memberName(r.member)} · ${r.source} ${nativeMoney(r.cents,unit)} → ${a}，收入折算 ${money(r.cnyCents??r.cents)}${fxNote}`:r.type==='balance'?`${r.date} · ${a} · 当日最终余额 ${nativeMoney(r.cents,unit)}${fxNote}`:`${r.date} · ${a} 转出本金 ${nativeMoney(r.cents,unit)} → ${D.accounts.find(a=>a.id===r.target).name} 实际到账 ${nativeMoney(r.targetCents??r.cents,r.targetCurrency||unit)}，另扣手续费 ${nativeMoney(r.feeCents,unit)}${fxNote}${r.targetFx?`；转入侧参考汇率 ${r.targetFx.rate}（${r.targetFx.date}）`:''}`;
    return {...r,summary:(r.type==='expense'?`${r.date} · ${memberName(r.member)} · ${r.category} · ${r.refund?'退款':'支出'} ${nativeMoney(r.cents,unit)} ≈ ${money(r.cnyCents??r.cents)} · ${r.affectsBalance?'同步更新余额':'仅统计，不改变余额'}${fxNote}`:summary)+(r.time?`；发生时间 ${r.time}`:'；未填时间：当天新增按保存时刻，历史余额视为日终')};
  });
  showDraft(rows,p.alreadyImported?'此批次已保存过。再次确认不会重复记账。':'格式检查通过，请核对下面的记录。');
  for(const w of p.warnings){const node=document.createElement('p');node.className='import-warning';node.textContent=w;$('draftContent').append(node);}
  if(p.warnings.some(w=>w.startsWith('已有完全相同'))){const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.id='duplicateAck';label.append(check,document.createTextNode(' 我已核对，这是另一笔实际发生的记录，确认仍要保存'));$('draftContent').append(label);}
  pendingImport=['portfolio','ledger-v2'].includes(p.kind)?{kind:p.kind,prepared:p.prepared,signature:p.signature}:{data,digest:p.digest};
  $('confirmDraft').textContent=p.alreadyImported?'确认已导入状态':'确认并保存到账本';
  $('importMessage').textContent=`已检查 ${rows.length} 条，请在下方“待确认草稿”核对。`;
}
function importGuide() {
  return [
    '请把文字或截图整理为家有数JSON，只输出数据，不输出命令。信息不清楚先问，不猜日期、金额、账户或汇率。',
    '流水格式：{"format":"family-assets-import","version":2,"batchId":"每批唯一的8至100位字母数字短横线编号","records":[...]}',
    '资金账户清单（只允许以下编号，币种固定）：'+JSON.stringify(D.legacyAccounts||D.accounts),
    '成员清单（收入member和持仓owner使用key，不使用name）：'+JSON.stringify(D.memberProfiles||[]),
    '收入：{"type":"income","date":"YYYY-MM-DD","member":"成员一","source":"工资","account":"账户编号","amount":"原币收入金额"}',
    '转账：{"type":"transfer","date":"YYYY-MM-DD","account":"转出账户编号","target":"转入账户编号","amount":"转出本金","targetAmount":"实际到账金额","fee":"本金之外另扣的转出币种手续费"}。跨币种必须同时填写两侧金额，同币种本金与到账相等，手续费另列。转账不算收入。',
    '盘点：{"type":"balance","date":"YYYY-MM-DD","time":"HH:mm:ss","account":"账户编号","amount":"该时点原币余额"}。收入和转账也可带time。当日未填时间按保存时刻，历史未填时间的余额视日终。同一批次同一时刻先记流水再校准，不重复加工资；更晚流水继续更新余额。补录较早事项须确认时间。',
    '金额用原币元的数字字符串，最多两位小数。外币自动采用发生日可用汇率；若历史日期早于当前报价，给fx:{"rate":"每1原币对应人民币","date":"YYYY-MM-DD","source":"用户确认来源"}。转入侧用targetFx，两个账户币种不同则分别提供，人民币侧无需填。不得猜历史汇率。',
    '收入归属独立于登录者和账户归属；每批最多100条。重试保持原批次编号，修改内容则新编号。'
  ].join('\n');
}
$('copyGuide').onclick=async()=>{const guide=importGuide()+portfolioGuide().replace('流水账户必须从当前账户清单选择。','资金流水可使用上文清单中的全部资金账户，不能使用股票或待归属RSU编号。');$('guidePreview').textContent=guide;$('guidePreview').hidden=false;try{await navigator.clipboard.writeText(guide);$('importMessage').textContent='格式说明已复制。发给聊天助手时附上你的文字或截图即可。';}catch{$('importMessage').textContent='格式说明已显示在下面，可手动复制。';}};
$('importExample').onclick=()=>{
  const rows=(D.legacyAccounts||D.accounts).filter(a=>['a','b','c','d'].includes(a.id)).map(a=>({type:'balance',date:D.today,account:a.id,cents:{a:6200000,b:9500000,c:13600000,d:450000}[a.id]}));
  $('importText').value=JSON.stringify(envelope(rows),null,2);
  $('importMessage').textContent='已填入虚拟余额示例。确认保存后会写入本机测试账本，请先核对。';
};
$('previewImport').onclick=async()=>{
  try{
    const value=$('importText').value.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
    await previewEnvelope(JSON.parse(value));
  }catch(e){pendingImport=null;draft=null;$('draftActions').hidden=true;$('importMessage').textContent=e instanceof SyntaxError?'格式不完整，请粘贴助手返回的完整JSON。':e.message;}
};
async function refreshLedger() {
  const state=await api('/api/state');D.load(state);
  refreshMemberControls();
  render();
  $('snapshotRows').innerHTML=[...D.allSnapshots,...D.reportingSnapshots().filter(s=>s.historical)].sort((a,b)=>b.date.localeCompare(a.date)).map(s=>`<tr><td>${s.date}</td><td>${s.complete?(s.historical?'历史家庭总额（无账户明细）':s.kind==='confirmed'?'全部账户同日确认':'沿用盘点及流水推算'):'部分账户初始余额待确认'}</td><td class="right">${s.complete?money(D.total(s)):'资料不足'}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">尚无记录，请先盘点初始余额。</td></tr>';
  renderPortfolio();
  refreshAccountControls();renderJournal();
  document.dispatchEvent(new Event('family-ledger-ready'));
}
function refreshMemberControls(){
  const keys=D.members||[];
  for(const id of ['recordMember','manageOwner','holdingOwner']){const el=$(id),chosen=el.value;el.replaceChildren();const allowed=id==='recordMember'?keys.filter(key=>D.memberProfiles.find(p=>p.key===key)?.active!==false):keys;for(const key of [...allowed,...(id==='recordMember'?[]:['共同'])])el.append(new Option(memberName(key)+(D.memberProfiles.find(p=>p.key===key)?.active===false?'（已移除）':''),key));if([...el.options].some(o=>o.value===chosen))el.value=chosen;}
  const group=$('members');group.replaceChildren();if(member!=='全家'&&D.memberProfiles.find(p=>p.key===member)?.active===false)member='全家';for(const key of ['全家',...keys.filter(k=>D.memberProfiles.find(p=>p.key===k)?.active!==false)]){const b=document.createElement('button');b.type='button';b.dataset.member=key;b.textContent=memberName(key);b.classList.toggle('active',key===member);b.onclick=()=>{member=key;group.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render();};group.append(b);}
  document.querySelector('.family span').textContent=`${(D.memberProfiles||[]).filter(p=>p.active).length} 位成员`;
}
function portfolioGuide(){
  return `\n\n外币余额、股票、待归属RSU使用另一个格式，不混入上述人民币流水。流水账户必须从当前账户清单选择。持仓格式：{"format":"family-assets-portfolio","version":1,"batchId":"每批唯一编号","records":[{"date":"YYYY-MM-DD","asset":{"id":"唯一持仓编号","name":"持仓名称含机构","owner":"成员一","kind":"cash","currency":"USD","origin":"other"},"amount":"10000.00"}]}\nkind可为cash（余额）、stock（已持有股票）、rsu（待归属RSU）；origin可为purchase、rsu、espp、other。股票和RSU的asset还需symbol（如NASDAQ:DEMO），记录中用quantity、price、priceDate代替amount；quantity与price为最多6位小数的数字字符串。RSU可加vestDate。ESPP仅录已到账股票，不录已扣未购资金、不自动算工资。已有持仓元数据不能改变，以下清单按原编号复用：${JSON.stringify((D.portfolio?.records||[]).filter((x,i,a)=>a.findIndex(y=>y.asset.id===x.asset.id)===i).map(x=>x.asset))}。\n自动汇率在预览时固定，只能用于不早于报价日的估值。历史盘点或缺失币种需要记录fx:{"rate":"每1原币对应多少人民币","date":"YYYY-MM-DD","source":"参考来源"}，不允许猜测历史汇率。不要重复录入券商总额及其中现金和股票。新持仓之前的历史不自动追溯，应补充历史盘点以作可比统计。`;
}
function updateRecordFields(){
  const accounts=D.legacyAccounts||D.accounts,a=accounts.find(a=>a.id===$('recordAccount').value),b=accounts.find(a=>a.id===$('targetAccount').value);
  const currency=a?.currency||'CNY',target=b?.currency||'CNY',transfer=$('recordKind').value==='transfer',cross=transfer&&currency!==target,manual=$('recordFxMode').value==='manual';
  $('recordFxMode').parentElement.hidden=currency==='CNY'&&(!transfer||target==='CNY');
  $('amountLabel').textContent=($('recordKind').value==='balance'?'实际余额':transfer?'转出本金':'收入金额')+`（${currency}）`;
  $('targetAmountLabel').textContent=`实际到账金额（${target}）`;$('feeLabel').textContent=`另扣手续费（${currency}，不含在本金中）`;
  $('targetAmountField').hidden=!cross;$('recordTargetAmount').required=cross;$('feeField').hidden=!transfer;
  const sourceRate=manual&&currency!=='CNY',targetRate=manual&&transfer&&target!=='CNY'&&currency!==target,any=sourceRate||targetRate;
  $('recordRateLabel').textContent=`1 ${currency} 折合人民币`;$('targetRateLabel').textContent=`1 ${target} 折合人民币`;
  for(const [field,input,on]of [['recordRateField','recordRate',sourceRate],['targetRateField','targetRate',targetRate],['recordRateDateField','recordRateDate',any],['recordRateSourceField','recordRateSource',any]]){$(field).hidden=!on;$(input).required=on;}
}
$('recordAccount').onchange=$('targetAccount').onchange=$('recordFxMode').onchange=updateRecordFields;
function refreshAccountControls(){
  const cash=(D.legacyAccounts||D.accounts).filter(a=>!a.archivedAt);
  for(const id of ['recordAccount','targetAccount','balanceAccount']){const chosen=$(id).value;$(id).replaceChildren();for(const a of cash)$(id).append(new Option(`${memberName(a.owner)} · ${a.name}（${a.currency||'CNY'}）`,a.id));if(cash.some(a=>a.id===chosen))$(id).value=chosen;}
  const chosen=$('manageAccount').value;$('manageAccount').replaceChildren(new Option('新增资金账户',''));
  for(const a of D.registeredAccounts||[])$('manageAccount').append(new Option(`${memberName(a.owner)} · ${a.name}（${a.currency}）`,a.id));
  if((D.registeredAccounts||[]).some(a=>a.id===chosen))$('manageAccount').value=chosen;
  updateRecordFields();
  updateBalanceCurrency();
}
function updateBalanceCurrency(){const a=(D.legacyAccounts||D.accounts).find(a=>a.id===$('balanceAccount').value);$('balanceAmount').parentElement.firstChild.textContent=`实际余额（${a?.currency||'CNY'}）`;}
$('balanceAccount').onchange=updateBalanceCurrency;
function updateManageFields(){
  const edit=!!$('manageAccount').value,manual=!edit&&$('manageCurrency').value!=='CNY'&&$('manageFxMode').value==='manual';
  $('manageCurrency').disabled=edit;
  for(const [field,input,on]of [['manageDateField','manageDate',!edit],['manageAmountField','manageAmount',!edit],['manageRateField','manageRate',manual],['manageRateDateField','manageRateDate',manual],['manageRateSourceField','manageRateSource',manual]]){$(field).hidden=!on;$(input).required=on;}
  $('manageFxField').hidden=edit||$('manageCurrency').value==='CNY';$('saveAccount').textContent=edit?'保存账户资料':'创建账户并保存初始余额';
}
$('manageAccount').onchange=()=>{const a=(D.registeredAccounts||[]).find(a=>a.id===$('manageAccount').value);$('manageName').value=a?.name||'';$('manageOwner').value=a?.owner||'成员一';$('manageType').value=a?.type||'银行卡';$('manageCurrency').value=a?.currency||'CNY';updateManageFields();};
$('manageCurrency').oninput=$('manageFxMode').onchange=updateManageFields;
$('accountForm').onsubmit=async event=>{
  event.preventDefault();if(!D.live){$('accountStatus').textContent='账户管理需在可保存的本机账本中使用。';return;}
  const input={name:$('manageName').value.trim(),owner:$('manageOwner').value,type:$('manageType').value};
  if($('manageAccount').value)input.id=$('manageAccount').value;
  else{Object.assign(input,{currency:$('manageCurrency').value,date:$('manageDate').value,amount:$('manageAmount').value});if(!$('manageRateField').hidden)input.fx={rate:$('manageRate').value,date:$('manageRateDate').value,source:$('manageRateSource').value.trim()};}
  $('saveAccount').disabled=true;
  try{const r=await api('/api/accounts',input);await refreshLedger();$('manageAccount').value=r.account.id;$('manageAccount').onchange();$('accountStatus').textContent='账户资料已保存。原有记录保持关联；新增账户的初始余额已一并保存。';}
  catch(e){$('accountStatus').textContent=e.message;}finally{$('saveAccount').disabled=false;}
};
function renderJournal(){
  $('journalRows').replaceChildren();const rows=(D.records||[]).filter(r=>r.type!=='expense').slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.order||0)-(a.order||0));
  for(const r of rows){const row=document.createElement('tr'),account=D.accounts.find(a=>a.id===r.account),target=D.accounts.find(a=>a.id===r.target);const values=[r.date,{income:'收入',transfer:'转账／换汇',expense:r.refund?'退款':'支出',balance:'余额确认',opening:'初始余额'}[r.type],(account?.name||r.account)+(target?' → '+target.name:''),nativeMoney(r.cents,r.currency||account?.currency||'CNY')+(r.type==='transfer'?` → ${nativeMoney(r.targetCents??r.cents,r.targetCurrency||target?.currency||'CNY')}；另扣 ${nativeMoney(r.feeCents,r.currency||account?.currency||'CNY')}`:''),(r.type==='expense'?[r.member,r.category,r.affectsBalance?'同步更新余额':'仅统计',r.memo||''].join(' · '):r.source?[r.member,r.source].join(' · '):r.memo||'')+(r.fx?` · 汇率日期 ${r.fx.date}`:'')];for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td);}$('journalRows').append(row);}
  if(!rows.length){const row=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent='尚无账户流水';row.append(td);$('journalRows').append(row);}
}
function updateHoldingFields(){
  const kind=$('holdingKind').value,stock=kind!=='cash',manual=$('holdingFxMode').value==='manual';
  for(const [field,input,required] of [['holdingSymbolField','holdingSymbol',stock],['holdingQuantityField','holdingQuantity',stock],['holdingPriceField','holdingPrice',stock],['holdingPriceDateField','holdingPriceDate',stock],['holdingAmountField','holdingAmount',!stock],['holdingRateField','holdingRate',manual],['holdingRateDateField','holdingRateDate',manual],['holdingRateSourceField','holdingRateSource',manual]]){$(field).hidden=!required;$(input).required=required;}
  $('holdingVestField').hidden=kind!=='rsu';
  if(kind==='rsu')$('holdingOrigin').value='rsu';
}
$('holdingKind').onchange=updateHoldingFields;$('holdingFxMode').onchange=updateHoldingFields;
$('holdingSelect').onchange=()=>{
  const id=$('holdingSelect').value,r=(D.portfolio?.records||[]).filter(r=>r.asset.id===id).at(-1);
  const fields=['holdingName','holdingOwner','holdingKind','holdingCurrency','holdingOrigin','holdingSymbol'];
  fields.forEach(id=>$(id).disabled=!!r);
  if(r){const a=r.asset;$('holdingName').value=a.name;$('holdingOwner').value=a.owner;$('holdingKind').value=a.kind;$('holdingCurrency').value=a.currency;$('holdingOrigin').value=a.origin;$('holdingSymbol').value=a.symbol||'';$('holdingAmount').value=(r.nativeCents/100).toFixed(2);$('holdingQuantity').value=r.quantity||'';$('holdingPrice').value=r.price||'';$('holdingPriceDate').value=r.priceDate||D.today;$('holdingVestDate').value=r.vestDate||'';}
  else{$('holdingName').value='';$('holdingOwner').value='成员一';$('holdingKind').value='cash';$('holdingCurrency').value='USD';$('holdingOrigin').value='other';$('holdingSymbol').value='';$('holdingAmount').value='';$('holdingQuantity').value='';$('holdingPrice').value='';$('holdingVestDate').value='';$('holdingPriceDate').value=D.today;}
  updateHoldingFields();
};
$('holdingForm').onsubmit=async event=>{
  event.preventDefault();
  if(!D.live){$('holdingMessage').textContent='请在可保存的本机账本中使用此功能。';return;}
  const asset={id:$('holdingSelect').value||FamilyClient.newId(),name:$('holdingName').value.trim(),owner:$('holdingOwner').value,kind:$('holdingKind').value,currency:$('holdingCurrency').value,origin:$('holdingOrigin').value};
  if(asset.kind!=='cash')asset.symbol=$('holdingSymbol').value.trim();
  const record={date:$('holdingDate').value,asset};
  if(asset.kind==='cash')record.amount=$('holdingAmount').value;
  else Object.assign(record,{quantity:$('holdingQuantity').value,price:$('holdingPrice').value,priceDate:$('holdingPriceDate').value});
  if(asset.kind==='rsu'&&$('holdingVestDate').value)record.vestDate=$('holdingVestDate').value;
  if($('holdingFxMode').value==='manual')record.fx={rate:$('holdingRate').value,date:$('holdingRateDate').value,source:$('holdingRateSource').value.trim()};
  try{await previewEnvelope({format:'family-assets-portfolio',version:1,batchId:FamilyClient.newId(),records:[record]});$('holdingMessage').textContent='已生成草稿，请到智能录入核对并确认。';location.hash='entry';}
  catch(e){$('holdingMessage').textContent=e.message;}
};
function renderPortfolio(){
  const p=D.portfolio||{held:[],pending:[],records:[],pendingCnyCents:0},all=[...p.held,...p.pending];
  $('holdingCount').textContent=p.held.length+' 项';$('rsuValue').textContent=money(p.pendingCnyCents);
  $('portfolioOverview').hidden=!all.length;
  $('portfolioOverview').textContent=`已持有外币／股票 ${p.held.length} 项计入主资产，待归属RSU参考值 ${money(p.pendingCnyCents)} 单独展示、不计入主资产。各估值日期和汇率可能不同；新增持仓范围及ESPP到账也会影响变化，不能全部当作收益。`;
  $('holdingRows').replaceChildren();
  if(!all.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='尚未记录外币或股票持仓。下方可填写并生成草稿。';$('holdingRows').append(empty);}
  for(const r of all){const box=document.createElement('div');box.className='holding-card';const name=document.createElement('strong'),value=document.createElement('strong'),meta=document.createElement('p'),detail=document.createElement('p');name.textContent=r.asset.name;value.textContent=money(r.cnyCents)+(r.asset.kind==='rsu'?'（待归属参考）':'');meta.textContent=`${memberName(r.asset.owner)} · ${r.asset.kind==='cash'?'外币余额':r.asset.kind==='rsu'?'待归属RSU':'已持有股票'} · 来源 ${r.asset.origin.toUpperCase()} · ${r.date}`;detail.textContent=`${r.asset.currency} ${(r.nativeCents/100).toLocaleString('zh-CN')} · 汇率 ${r.fx.rate}（${r.fx.date}，${r.fx.source}）${r.quantity!==undefined?` · ${r.quantity}股 × ${r.price}（价格 ${r.priceDate}）`:''}${r.vestDate?' · 预计归属 '+r.vestDate:''}`;box.append(name,value,meta,detail);$('holdingRows').append(box);}
  const chosen=$('holdingSelect').value;$('holdingSelect').replaceChildren(new Option('新建一项持仓',''));
  for(const r of all)$('holdingSelect').append(new Option(`${memberName(r.asset.owner)} · ${r.asset.name}`,r.asset.id));
  if(all.some(r=>r.asset.id===chosen))$('holdingSelect').value=chosen;
  const currencies=new Map(),types=new Map();
  let incomplete=false;
  for(const b of D.balances||[]){
    if(b.cents===null){incomplete=true;continue;}
    const currency=b.currency||'CNY',kind=b.type==='股票'?'股票':b.type==='理财'?'理财':'现金与存款';
    currencies.set(currency,(currencies.get(currency)||0)+b.cents);types.set(kind,(types.get(kind)||0)+b.cents);
  }
  function draw(id,groups){
    $(id).replaceChildren();const max=Math.max(...groups.values(),1);
    if(!groups.size){const empty=document.createElement('p');empty.className='muted';empty.textContent='暂无已确认金额';$(id).append(empty);return;}
    for(const [name,cents]of groups){const row=document.createElement('div');row.className='bar-row';const label=document.createElement('div');label.className='bar-label';const n=document.createElement('span'),v=document.createElement('strong');n.textContent=name;v.textContent=money(cents);label.append(n,v);const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.className='fill';fill.style.width=Math.max(0,cents)/max*100+'%';track.append(fill);row.append(label,track);$(id).append(row);}
  }
  draw('currencyBreakdown',currencies);draw('typeBreakdown',types);
  $('allocationNote').textContent=(incomplete?'部分基础账户余额未知，以上仅显示已知金额，不能视为完整家庭分布。':'按各项最近一次已保存估值汇总。')+' 待归属RSU未计入，图表不是投资收益分析。';
}
updateHoldingFields();
updateManageFields();
route();
(async()=>{
  try{
    await refreshLedger();
    D.deployment=(await api('/api/runtime')).deployment;
    $('appNotice').textContent='家庭试用账本：记录家庭收入、自定义资金账户、外币流水及持仓估值，确认后保存。已启用家庭登录。'+(D.deployment?'数据保存在部署设备，请定期下载备份。':'当前仅供这台电脑本机试用。');
    document.querySelector('.badge').textContent='试用版 · 已登录 · 可保存';
    document.querySelector('.prototype').textContent='家庭试用账本 · SQLite 保存';
    $('ledgerConnection').textContent='账本已连接';
    $('appFooter').textContent=D.deployment?'家庭部署试用版 · 已启用登录和完整备份恢复 · AI待接入':'本机开发试用版 · 已启用登录和完整备份恢复 · 提供群晖安装包';
    $('recordDate').value=$('balanceDate').value=$('holdingDate').value=$('holdingPriceDate').value=$('holdingRateDate').value=$('recordRateDate').value=$('manageDate').value=$('manageRateDate').value=D.today; $('balanceDate').removeAttribute('min');$('manageDate').max=D.today;
    $('recordTime').value='';
    $('period').value=Number(D.today.slice(0,4)); $('start').value=D.today.slice(0,4)+'-01-01';$('end').value=D.today;
    $('confirmDraft').textContent='确认并保存到账本';
    document.querySelector('#balanceForm button').textContent='生成余额盘点草稿';
    document.querySelector('#balanceForm').parentElement.querySelector('.status-tag').textContent='可保存';
    document.querySelector('#balanceForm').nextElementSibling.textContent='生成草稿后，到记录与更新页核对并保存。';
    document.querySelector('#balanceForm').nextElementSibling.nextElementSibling.textContent='允许历史补录；后续已确认余额保持不变，期间校准差额重新计算。同账户同日盘点暂不支持覆盖。';
    document.querySelector('#manualForm').previousElementSibling.querySelector('p').textContent='填写后生成草稿，确认后保存并更新统计。';
    document.querySelector('#draftPanel .panel-head p').textContent='核对金额、日期、成员和账户，确认后保存；同一批次重复提交不会重复记账。';
    document.querySelector('#assets')?.removeAttribute('data-demo');
    $('backupExport').textContent='下载完整账本备份';
    document.querySelector('.backup-box strong').textContent='完整账本备份';
    document.querySelector('.backup-box p').textContent='包含账户、收入与转账、资产盘点、外币与股票估值及历史汇总。';
    document.querySelector('[data-page="assets"] .panel-head .muted').textContent='当前本机账本';
    document.querySelector('.trend .panel-head p').textContent='记录点可能为实际盘点、沿用旧值或流水推算。下方说明数据范围。';
    document.querySelector('#assetHistory .panel-head h2').textContent='资产状态历史';
    document.querySelector('#assetHistory .panel-head p').textContent='分别标记同日完整盘点、沿用旧值及流水推算；未知初始余额不会当成零。新增持仓范围也会改变曲线，不等于投资收益。';
    preset();
    if(location.hash==='#settings')loadFx();
    document.dispatchEvent(new Event('family-app-ready'));
  }catch{
    $('ledgerConnection').textContent='静态原型 · 暂不可保存';
    $('importMessage').textContent='粘贴导入需在本机试用账本中使用，静态预览保留原有演示功能。';
  }
})();
