'use strict';
(()=>{
 const PF=FamilyPanelFilters;
 $('reportControls').hidden=true;$('error').remove();const error=document.createElement('p');error.id='error';error.setAttribute('role','alert');$('appNotice').after(error);
 const overview=document.querySelector('[data-page=overview]'),stats=overview.querySelector('.stats'),metrics=document.createElement('section');metrics.id='overviewMetrics';metrics.className='overview-metrics-block';const heading=document.createElement('div');heading.className='panel-head';heading.innerHTML='<div><h2>家庭概况</h2><p>本板块的资产与收入指标使用同一时间范围。</p></div>';stats.before(metrics);metrics.append(heading,stats);
 const summary=document.querySelector('.income-summary');summary.id='incomeSummary';summary.classList.add('panel');$('details').querySelector('.panel-head').append($('export'));$('details').querySelector('.panel-head').after($('members'));$('details').querySelector('.panel-head p').textContent='本板块成员、时间范围与CSV导出一致；不会改变其他图表。';$('income').querySelector('.panel-head p').textContent='家庭已录收入构成与来源分布，使用本板块的时间范围。';
 for(const [el,id,title,chart]of [[metrics,'overview-metrics','家庭概况',false],[$('trend'),'asset-trend','家庭资产趋势',true],[summary,'income-summary','收入汇总',false],[$('income'),'income-composition','家庭收入构成',true],[$('details'),'income-details','收入明细',false]])PF.mount(el,id,title,{chart});
 for(const [id,title,comparison]of [['reportIncomeLines','成员与家庭收入',false],['reportProvidentLines','公积金收入',false],['incomeYearComparison','跨年收入对比',true],['providentYearComparison','跨年公积金对比',true]])PF.mount($(id),id,title,{chart:true,mode:comparison?'comparison':'range'});
 for(const id of ['asset-types','asset-currencies','overview-types','overview-currencies'])PF.mount($(id),id,$(id).querySelector('h2').textContent,{chart:true,mode:'current'});
 document.querySelector('[data-page=income]>.demo-notice')?.remove();
 function repaint(){render();PF.refresh();}
 document.addEventListener('family-panel-change',e=>{if(e.detail.kind!=='chart')repaint();});document.addEventListener('family-ledger-ready',()=>PF.refresh());window.addEventListener('hashchange',()=>PF.refresh());if(D.live)repaint();else PF.refresh();
})();
