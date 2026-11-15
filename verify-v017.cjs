'use strict';
const assert=require('node:assert/strict');
const {select,sourceGroups,monthlyGroups}=require('./prototype/overview-ui.js');
const period=require('./prototype/history-period.js');
for(const [request,saved,result]of [['overview',null,'asset-analysis'],['overview','income','income'],['overview','bad','asset-analysis'],['summary','income','asset-analysis'],['trend','income','asset-analysis'],['income',null,'income']])assert.equal(select(request,saved),result);
const rows=[{member:'a',category:'工资奖金',source:'工资',cents:1500},{member:'b',category:'工资奖金',source:'奖金',cents:500},{member:'former',category:'工资奖金',cents:250},{member:'a',category:'其他',source:'稿费',cents:50},{member:'b',category:'公积金',cents:100}];
const groups=sourceGroups(rows,['a','b']);
assert.deepEqual(groups.map(g=>[g.label,g.total]),[['工资奖金',2250],['公积金',100],['稿费',50]]);
assert.deepEqual([...groups[0].sums],[['a',1500],['b',500],[null,250]]);
assert.equal(groups.reduce((a,g)=>a+g.total,0),rows.reduce((a,r)=>a+r.cents,0));
const monthly=monthlyGroups([
 {date:'2026-10-31',month:'2026-10',historical:true,cents:100},
 {date:'2026-11-15',category:'工资奖金',source:'奖金',cents:50},
 {date:'2026-11-15',start:'2026-09-01',historical:true,cents:200}
],period);
assert.deepEqual(monthly.months.map(([month,items])=>[month,items[0].source]),[['2026-11','奖金'],['2026-10','历史汇总（未分来源）']]);
assert.equal(monthly.unsplit[0].cents,200);
console.log('家庭概况选项、收入来源和家庭合计检查通过。');
