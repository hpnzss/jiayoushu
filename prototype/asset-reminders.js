'use strict';
(()=>{
 const reminder=document.createElement('div');reminder.className='demo-notice';reminder.id='inventoryReminder';document.querySelector('[data-page="overview"]').prepend(reminder);
 function draw(){if(!D.live)return;const unknown=(D.balances||[]).filter(a=>a.cents===null),stale=(D.balances||[]).filter(a=>a.confirmedDate&&Date.parse(D.today)-Date.parse(a.confirmedDate)>30*86400000);reminder.textContent=unknown.length?'待办：'+unknown.length+'个账户尚无初始余额，请先建立资产基准。':stale.length?'盘点提醒：'+stale.length+'个账户超过30天没有确认实际余额。':'';reminder.hidden=!reminder.textContent;}

 window.FamilyAssetReminders={render:draw};document.addEventListener('family-ledger-ready',draw);if(D.live)draw();
})();

