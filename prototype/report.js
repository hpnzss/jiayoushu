(function (root) {
  'use strict';
  const P=typeof module!=='undefined'&&module.exports?require('./history-period.js'):root.FamilyHistoryPeriod;
  const accounts = [
    { id: 'a', name: '招商银行 · 工资卡', owner: '成员一', type: '银行卡' },
    { id: 'b', name: '工商银行 · 储蓄卡', owner: '成员二', type: '银行卡' },
    { id: 'c', name: '家庭理财', owner: '共同', type: '理财' },
    { id: 'd', name: '支付宝及微信', owner: '共同', type: '零钱' }
  ];
  const raw = [
    ['2025-12-31', 30000, 50000, 100000, 5000],
    ['2026-01-31', 36000, 55000, 100500, 4500],
    ['2026-02-28', 40000, 58000, 102000, 4000],
    ['2026-03-31', 42000, 65000, 105000, 5000],
    ['2026-04-30', 45000, 66000, 108000, 4000],
    ['2026-05-31', 38000, 72000, 115000, 5000],
    ['2026-06-30', 50000, 75000, 118000, 4500],
    ['2026-07-31', 52000, 80000, 120000, 5000],
    ['2026-08-31', 55000, 85000, 125000, 4000],
    ['2026-09-30', 48000, 92000, 135000, 5000],
    ['2026-10-15', 62000, 95000, 136000, 4500]
  ];
  const snapshots = raw.map(([date, ...amounts]) => ({ date, amounts: amounts.map(x => x * 100) }));
  const incomes = [];
  for (let m = 1; m <= 10; m++) {
    const month = String(m).padStart(2, '0');
    incomes.push({ date: `2026-${month}-10`, member: '成员一', source: '工资', account: 'a', cents: 1500000 });
    incomes.push({ date: `2026-${month}-15`, member: '成员二', source: '工资', account: 'b', cents: 1200000 });
    if (m === 2 || m === 6 || m === 9) incomes.push({ date: `2026-${month}-12`, member: '成员一', source: '奖金', account: 'a', cents: 800000 });
    if (m === 3 || m === 9) incomes.push({ date: `2026-${month}-08`, member: '成员二', source: '兼职', account: 'b', cents: 300000 });
  }
  incomes.sort((a, b) => a.date.localeCompare(b.date));
  const total = s => s.amounts.reduce((a, b) => a + b, 0);
  function report(start, end, member = '全家') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw new Error('请选择有效的起止日期，开始日期不能晚于结束日期。');
    const rows = api.reportingIncomes().filter(x => x.date >= start && x.date <= end && (!x.historical||P.contains(x,start,end)));
    const selected = rows.filter(x => member === '全家' || x.member === member);
    const reportingSnapshots=api.reportingSnapshots();
    const opening = reportingSnapshots.filter(x => x.date < start).at(-1) || null;
    const closing = reportingSnapshots.filter(x => x.date <= end).at(-1) || null;
    const points = reportingSnapshots.filter(x => x.date >= start && x.date <= end);
    const income = selected.reduce((n, x) => n + x.cents, 0);
    const familyIncome = rows.reduce((n, x) => n + x.cents, 0);
    const delta = opening && closing ? total(closing) - total(opening) : null;
    const E=typeof module!=='undefined'&&module.exports?require('./expenses-report.js'):root.FamilyExpenses;
    const expense=E.report(api.records||[],api.expenseSummaries||[],start,end,member);
    const familyExpense=member==='全家'?expense:E.report(api.records||[],api.expenseSummaries||[],start,end);
    return { start, end, member, rows: selected, income, familyIncome, opening, closing, points, delta,expense,familyExpense,
      // 示例没有逐笔完整记录其他资产影响，故此值仅表示资产变化与收入的差额。
      partialHistory:api.history.some(x=>x.kind==='income'&&P.overlaps(x,{start,date:end})&&!P.contains(x,start,end)),
      historical:!!(opening?.historical||closing?.historical||rows.some(x=>x.historical)),
      gap: delta === null||familyExpense.unresolved.length||opening?.historical||closing?.historical||rows.some(x=>x.historical) ? null : delta - familyIncome + familyExpense.knownCents,
      byMember: (api.members||['成员一','成员二']).map(name => ({ name, cents: rows.filter(x => x.member === name).reduce((n, x) => n + x.cents, 0) })) };
  }
  const api = { accounts, snapshots, incomes, total, report, history:[],today: '2026-10-15', live:false,
    reportingIncomes(){return [...incomes,...api.history.filter(r=>r.kind==='income').map(r=>({...r,historical:true,source:r.month?'历史月收入汇总':r.grain==='year'?'历史年收入汇总':'历史期间收入汇总',category:'其他',currency:'CNY'}))].sort((a,b)=>a.date.localeCompare(b.date));},
    reportingSnapshots(){const dates=new Map(api.history.filter(r=>r.kind==='assets').map(r=>[r.date,{date:r.date,amounts:[r.cents],complete:true,kind:'historical',historical:true}]));for(const s of snapshots)dates.set(s.date,s);return [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date));},
    load(state) {
      accounts.splice(0,accounts.length,...state.accounts);
      snapshots.splice(0,snapshots.length,...state.snapshots.filter(s=>s.complete));
      incomes.splice(0,incomes.length,...state.incomes);
      api.balances=state.balances; api.allSnapshots=state.snapshots; api.records=state.records; api.adjustments=state.adjustments; api.live=true;
      api.expenseSummaries=state.expenseSummaries||[];
      api.history=state.history||[];
      api.memberProfiles=state.memberProfiles||[];api.members=[...new Set([...(state.members||['成员一','成员二']),...state.incomes.map(r=>r.member)])];api.periods=state.periods||[];
      api.memberName=key=>key==='共同'?'共同':api.memberProfiles.find(p=>p.key===key)?.name||key;
      api.portfolio=state.portfolio;api.legacyAccounts=state.legacyAccounts||state.accounts;
      api.registeredAccounts=state.registeredAccounts||state.accounts;
      api.today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FamilyReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
