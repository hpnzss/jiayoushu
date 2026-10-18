(function(root){
 const presets=[['current','本月'],['month','近1月'],['3','近3月'],['ytd','年初至今'],['6','近半年'],['12','近1年'],['24','近2年'],['36','近3年'],['60','近5年'],['all','有史以来']];
 const valid=d=>typeof d==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 function resolve(spec,today,earliest=today){if(!valid(today))throw Error('当前日期无效。');spec=spec||{preset:'all'};let start=today.slice(0,4)+'-01-01',end=today,label=presets.find(p=>p[0]===spec.preset)?.[1]||'自选时间';if(spec.preset==='custom'){if(!valid(spec.start)||!valid(spec.end)||spec.start>spec.end||spec.end>today)throw Error('请选择有效起止日期，结束日期不能晚于今天。');return{start:spec.start,end:spec.end,label,preset:'custom'};}if(!presets.some(p=>p[0]===spec.preset))throw Error('时间选项无效。');if(spec.preset==='current')start=today.slice(0,7)+'-01';else if(spec.preset==='all')start=valid(earliest)&&earliest<today?earliest:today;else if(spec.preset==='month'){const d=new Date(today+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));start=d.toISOString().slice(0,10);}else if(/^\d+$/.test(spec.preset)){const d=new Date(today+'T00:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-Number(spec.preset)+1);start=d.toISOString().slice(0,10);}return{start,end,label,preset:spec.preset};}
 const api={resolve,valid,presets};if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}root.FamilyPanelFilters=api;
 const R=root.FamilyReport,cache=new Map(),mounts=new Map();let loadedKey=null;
 const storageKey=()=> 'family-panel-controls-v1:'+location.origin+':'+(root.currentFamilyUser?.member||'anonymous');
 function load(){const key=storageKey();if(key===loadedKey)return;loadedKey=key;cache.clear();try{const data=JSON.parse(localStorage.getItem(key)||'{}');if(data&&typeof data==='object')for(const [id,value]of Object.entries(data))if(value&&typeof value==='object')cache.set(id,value);}catch{}}
 function save(){try{localStorage.setItem(loadedKey,JSON.stringify(Object.fromEntries(cache)));}catch{}}
 function pref(id){load();return cache.get(id)||{};}
 function earliest(){const dates=[R.today,...R.reportingIncomes().map(r=>r.start||r.month&&r.month+'-01'||r.date),...R.reportingSnapshots().map(r=>r.date)].filter(valid);return dates.sort()[0]||R.today;}
 function range(id){try{return resolve(pref(id).range||{preset:'all'},R.today,earliest());}catch{return resolve({preset:'all'},R.today,earliest());}}
 function report(id,member='全家'){const r=range(id);return R.report(r.start,r.end,member);}
 function update(id,patch,kind='range',notify=true){load();cache.set(id,{...pref(id),...patch});save();refresh();if(notify)document.dispatchEvent(new CustomEvent('family-panel-change',{detail:{id,kind}}));}
 function set(id,spec,notify=true){resolve(spec,R.today,earliest());update(id,{range:spec},'range',notify);}
 function numbers(id){return pref(id).numbers!==false;}
 function refresh(){for(const [id,m]of mounts){const r=m.mode==='range'?range(id):null;if(r){m.caption.textContent=r.start+' — '+r.end;const key=JSON.stringify(r);if(m.rangeKey!==key){m.start.value=r.start;m.end.value=r.end;m.start.max=m.end.max=R.today;m.rangeKey=key;m.error.textContent='';for(const b of m.presets.querySelectorAll('[data-local-preset]')){const active=b.dataset.localPreset===r.preset;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}}}m.el.classList.toggle('hide-chart-numbers',!numbers(id));if(m.checkbox)m.checkbox.checked=numbers(id);for(const b of m.el.querySelectorAll('[data-amount-control]'))b.disabled=!numbers(id);if(m.warning&&R.live){const s=report(id);m.warning.hidden=!s.partialHistory;m.warning.textContent='此范围只覆盖部分历史收入汇总，该条未计入；可选择完整期间查看。';}}root.FamilyDateControls?.refresh();}
 function mount(el,id,title,{mode='range',chart=false,anchor=null}={}){
  if(!el||mounts.has(id))return;
  const controls=document.createElement('div');controls.className='panel-local-controls';controls.dataset.panelControls=id;const m={el,mode};
  if(mode==='range'){
   const heading=document.createElement('div');heading.className='panel-range-heading';const label=document.createElement('span');label.textContent='时间范围';const caption=document.createElement('span');caption.className='panel-range-caption';heading.append(label,caption);controls.append(heading);m.caption=caption;
   const options=document.createElement('div');options.className='panel-range-options';const shortcuts=document.createElement('div');shortcuts.className='range-shortcuts panel-inline-presets';shortcuts.setAttribute('role','group');shortcuts.setAttribute('aria-label',title+'：快捷时间');m.presets=shortcuts;
   for(const [key,text]of presets){const b=document.createElement('button');b.type='button';b.className='outline';b.dataset.localPreset=key;b.textContent=text;b.onclick=()=>set(id,{preset:key});shortcuts.append(b);}
   const form=document.createElement('form');form.className='panel-inline-dates';form.setAttribute('aria-label',title+'：自选时间');
   for(const [name,text]of [['start','开始日期'],['end','结束日期']]){const field=document.createElement('label');field.className='field';field.textContent=text;const input=document.createElement('input');input.type='date';input.required=true;input.id='panel-'+id+'-'+name;input.setAttribute('aria-label',title+'：'+text);field.append(input);form.append(field);m[name]=input;}
   const apply=document.createElement('button');apply.type='submit';apply.className='outline';apply.textContent='应用';apply.setAttribute('aria-label',title+'：应用自选时间');form.append(apply);const error=document.createElement('p');error.className='panel-range-error';error.setAttribute('role','alert');m.error=error;
   form.onsubmit=e=>{e.preventDefault();try{set(id,{preset:'custom',start:m.start.value,end:m.end.value});}catch(e){error.textContent=e.message;}};
   options.append(shortcuts,form,error);controls.append(options);
   const warning=document.createElement('p');warning.className='muted panel-range-warning';warning.hidden=true;warning.dataset.rangeWarning=id;el.append(warning);m.warning=warning;
  }else if(mode==='current'){const badge=document.createElement('span');badge.className='muted';badge.textContent='当前资产 · 各账户最新保存估值';controls.append(badge);}
  if(chart){const label=document.createElement('label');label.className='chart-number-switch';const box=document.createElement('input');box.type='checkbox';box.checked=numbers(id);box.setAttribute('aria-label',title+'：显示图上数字');box.onchange=()=>update(id,{numbers:box.checked},'numbers');label.append(box,document.createTextNode('显示图上数字'));controls.append(label);m.checkbox=box;}
  const head=anchor||el.querySelector('.panel-head');if(head)head.after(controls);else el.prepend(controls);mounts.set(id,m);refresh();
 }
 const incomeScopes=['income-summary','income-composition','income-details','reportIncomeLines','reportProvidentLines'];
 function batch(ids,spec){for(const id of ids)set(id,spec,false);document.dispatchEvent(new CustomEvent('family-panel-change',{detail:{id:'batch',kind:'range'}}));}
 Object.assign(api,{range,report,pref,update,set,numbers,refresh,mount,storageKey,earliest,showHistory:()=>batch([...incomeScopes,'asset-trend'],{preset:'all'}),openMonth:month=>{const end=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10);batch(incomeScopes,{preset:'custom',start:month+'-01',end:end>R.today?R.today:end});}});
 document.addEventListener('family-session-ready',refresh);document.addEventListener('family-ledger-ready',refresh);
})(globalThis);
