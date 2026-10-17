'use strict';
(()=>{
  const box=$('backupStatus').closest('article');
  box.querySelector('.panel-head p').textContent='下载完整账本；恢复前先检查内容，再确认覆盖。登录账号与密码不随备份迁移。';
  box.querySelector('.backup-box strong').textContent='完整账本备份';
  box.querySelector('.backup-box p').textContent='包含资金账户、收入与转账、盘点、持仓估值、月度支出及关账总结。';
  const label=$('backupImport').closest('label');label.firstChild.textContent='选择完整账本备份进行检查';label.querySelector('small').textContent='最多16MB。选文件只做检查，不会直接覆盖数据。';
  const restore=document.createElement('div');restore.hidden=true;restore.innerHTML='<p id="backupSummary"></p><label><input id="restoreAgree" type="checkbox"> 我确认用备份替换当前账本</label><label class="field">当前登录密码<input id="restorePassword" type="password" autocomplete="current-password"></label><button id="restoreConfirm" class="solid" type="button">确认恢复账本</button><p id="restoreResult" role="status"></p>';
  box.append(restore);const auto=document.createElement('p');auto.className='muted';box.append(auto);
  let token=null,sequence=0,busy=false;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('family-data'):null;
  if(channel)channel.onmessage=()=>location.reload();
  async function status(){try{const s=await api('/api/backups/status');auto.textContent=s.lastError||`服务器自动备份：${s.lastAutomatic?'已有每日副本':'尚无副本'}；恢复前副本：${s.lastSafetyBackup?'已有':'暂无'}。程序运行时每6小时检查，每天保存一份，位于数据目录 backups。请定期下载并另存一份。`; }catch(e){auto.textContent=e.message;}}
  $('backupExport').onclick=async()=>{try{const b=await api('/api/backups/export');download('家有数_完整账本_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(b,null,2),'application/json');$('backupStatus').textContent='完整账本备份已下载。文件含家庭财务数据，请妥善保存。';}catch(e){$('backupStatus').textContent=e.message;}};
  $('backupImport').onchange=async()=>{
    const current=++sequence,file=$('backupImport').files[0];token=null;restore.hidden=true;$('restoreAgree').checked=false;$('restorePassword').value='';$('restoreResult').textContent='';if(!file)return;
    $('backupStatus').textContent='正在检查文件与账本内容……';
    try{if(file.size>16*1024*1024)throw Error('请选择16MB以内的完整备份。');const backup=JSON.parse(await file.text()),p=await api('/api/backups/preview',{backup});if(current!==sequence)return;token=p.token;const s=p.summary;$('backupSummary').textContent=`备份时间：${new Date(s.createdAt).toLocaleString('zh-CN')}。包含 ${s.accounts} 个资金账户、${s.records} 条流水、${s.holdings} 条持仓估值、${s.months} 条月度支出。${p.warning}`;restore.hidden=false;$('backupStatus').textContent='文件检查通过，尚未恢复。请核对内容，10分钟内确认。';}
    catch(e){if(current===sequence)$('backupStatus').textContent=e instanceof SyntaxError?'文件不是有效的JSON备份。':e.message;}
  };
  $('restoreConfirm').onclick=async()=>{
    if(busy||!token)return;if(!$('restoreAgree').checked){$('restoreResult').textContent='请先勾选覆盖确认。';return;}if(!$('restorePassword').value){$('restoreResult').textContent='请输入当前登录密码。';return;}
    busy=true;$('restoreConfirm').disabled=true;$('backupImport').disabled=true;
    try{await api('/api/backups/restore',{token,password:$('restorePassword').value,acknowledge:true});sessionStorage.setItem('family-restore-notice','账本已恢复，恢复前的账本已在服务器数据目录 backups 目录保存。');channel?.postMessage('restored');location.reload();}
    catch(e){$('restoreResult').textContent=e.message;}finally{$('restorePassword').value='';busy=false;$('restoreConfirm').disabled=false;$('backupImport').disabled=false;status();}
  };
  function labels(){ $('backupExport').textContent='下载完整账本备份';box.querySelector('.backup-box strong').textContent='完整账本备份';box.querySelector('.backup-box p').textContent='包含资金账户、收入与转账、盘点、持仓估值、月度支出及关账总结。';$('appFooter').textContent=D.deployment?'家庭部署试用版 · 已启用登录和完整备份恢复 · AI待接入':'本机开发试用版 · 已启用登录和完整备份恢复 · 提供群晖安装包';}
  labels();status();window.addEventListener('hashchange',()=>{if(location.hash==='#settings'){labels();status();}});
  const notice=sessionStorage.getItem('family-restore-notice');$('backupStatus').textContent=notice||'尚未选择文件。下载的完整备份可以在这里检查并恢复。';if(notice)sessionStorage.removeItem('family-restore-notice');
})();
