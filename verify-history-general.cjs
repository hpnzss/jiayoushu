const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openHistory,validateStored}=require('./history.cjs'),P=require('./prototype/history-period.js'),report=require('./prototype/report.js'),{series}=require('./prototype/income-series.js');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-history-general-')),profiles=[{key:'成员一',name:'甲',active:true},{key:'成员二',name:'乙',active:true},{key:'member-0123456789abcdef',name:'丙',active:true}];let live=[],closed=[];
const history=openHistory(path.join(dir,'test.sqlite'),{profiles:()=>profiles,state:()=>({incomes:live,snapshots:[]}),periods:()=>closed,today:()=> '2026-10-17'});
const input=text=>({kind:'income',text:'期间,成员,收入金额,备注\n'+text});
const save=data=>{const p=history.preview(data,'test');return history.commit(p.token,'test');};
try{
 assert.equal(save(input('2010-01,甲,100,合成\n2010-01-03,乙,80,合成\n2010-01,丙,70,合成\n2011,甲,1200,合成\n2012-01-01~2012-03-31,乙,900,合成\n2014-07-01~2015-06-30,丙,500,合成')).add,6);
 assert.equal(history.list().filter(r=>r.kind==='income').length,6);for(const {key,...row}of history.list())validateStored(row,key);
 assert.equal(history.preview(input('2010-01-01~2010-01-31,甲,100,合成'),'test').summary.skip,1);
 assert.equal(history.preview({kind:'income',members:['成员一','成员二'],text:'月份,成员一收入,成员二收入,备注\n2010-01,100,,合成'},'test').summary.skip,1);
 assert.throws(()=>history.preview(input('2010,甲,1000,重叠'),'test'),/重叠/);assert.throws(()=>history.assertNoIncomeOverlap([{type:'income',member:'成员一',date:'2011-05-01'}]),/历史收入/);
 live=[{type:'income',member:'成员二',date:'2016-06-02',cents:100}];assert.throws(()=>history.preview(input('2016,乙,1000,重叠'),'test'),/逐笔收入/);live=[];
 closed=[{month:'2017-07'}];assert.throws(()=>history.preview(input('2017,甲,100,关账'),'test'),/关账/);closed=[];
 assert.throws(()=>history.preview(input('2018,陌生人,100,未知'),'test'),/成员/);profiles.push({...profiles[0],key:'member-fedcba9876543210'});assert.throws(()=>history.preview(input('2018,甲,100,重名'),'test'),/重名/);profiles.pop();
 assert.equal(save(input('2018,成员一,100,使用成员编号')).add,1);
 report.load({accounts:[],snapshots:[],incomes:[],balances:[],records:[],adjustments:[],memberProfiles:profiles,members:profiles.map(p=>p.key),history:history.list()});
 assert.equal(report.report('2010-01-01','2010-01-31').income,25000);assert.equal(report.report('2011-01-01','2011-12-31').income,120000);assert.equal(report.report('2011-06-01','2011-06-30').income,0);assert(report.report('2011-06-01','2011-06-30').partialHistory);
 const monthly=series(report.reportingIncomes(),profiles.map(p=>p.key),{grain:'month',start:'2011-01-01',end:'2011-12-31',today:'2026-10-17'});assert(monthly.lines[0].values.every(v=>v===null));assert.equal(monthly.unallocated,1);
 const yearly=series(report.reportingIncomes(),profiles.map(p=>p.key),{grain:'year',start:'2011-01-01',end:'2011-12-31',today:'2026-10-17'});assert.equal(yearly.lines[0].values[0],120000);
 assert.equal(report.report('2014-07-01','2015-06-30').income,50000);const crossYear=series(report.reportingIncomes(),profiles.map(p=>p.key),{grain:'year',start:'2014-01-01',end:'2015-12-31',today:'2026-10-17'});assert(crossYear.lines[2].values.every(v=>v===null));assert.equal(crossYear.unallocated,1);
 assert.deepEqual(P.parse('2018/2'),{start:'2018-02-01',end:'2018-02-28',grain:'month',label:'2018-02'});assert.throws(()=>P.parse('2018-02-30'));assert.throws(()=>P.parse('2018-12-31~2018-01-01'));
 console.log('通用历史导入通过：任意成员、具体日期/月/年/自选期间、旧快捷格式互通、重名与未知成员拒绝、期间重叠防重、整段汇总统计、年度不拆月及跨年不伪造分摊。');
}finally{history.close();fs.rmSync(dir,{recursive:true,force:true});}
