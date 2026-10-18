'use strict';
(()=>{
 const reminder=document.createElement('div');reminder.className='demo-notice';reminder.id='inventoryReminder';document.querySelector('[data-page="overview"]').prepend(reminder);
 const panel=document.createElement('article');panel.className='panel';panel.innerHTML='<div class="panel-head"><div><h2>盘点核对 · 实际余额与账面差额</h2><p>实际余额校准账本，差额可能包含消费、估值与汇率变化，本软件不推算支出或投资收益。</p></div></div><div class="table-scroll"><table><thead><tr><th>日期</th><th>账户</th><th class="right">盘点校准差额（原币）</th></tr></thead><tbody id="reconciliationRows"></tbody></table></div>';document.querySelector('[data-page="assets"]').append(panel);
 function draw(){if(!D.live)return;const unknown=(D.balances||[]).filter(a=>a.cents===null),stale=(D.balances||[]).filter(a=>a.confirmedDate&&Date.parse(D.today)-Date.parse(a.confirmedDate)>30*86400000);reminder.textContent=unknown.length?'待办：'+unknown.length+'个账户尚无初始余额，请先建立资产基准。':stale.length?'盘点提醒：'+stale.length+'个账户超过30天没有确认实际余额。':'账户初始余额已齐全，定期盘点即可。';$('reconciliationRows').innerHTML=(D.adjustments||[]).slice().reverse().slice(0,30).map(a=>'<tr><td>'+a.date+'</td><td>'+escapeHTML(D.accounts.find(x=>x.id===a.account)?.name||a.account)+'</td><td class="right">'+(a.cents===null?'首次确认，无可比余额':nativeMoney(a.cents,a.currency))+'</td></tr>').join('')||'<tr><td colspan="3" class="empty">盘点后在此显示核对结果</td></tr>';}

 window.FamilyAssetReminders={render:draw};document.addEventListener('family-ledger-ready',draw);if(D.live)draw();
})();

