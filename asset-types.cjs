const ACCOUNT_TYPES=['现金','银行存款','网络平台余额','网络平台','股票','理财','银行理财','基金','加密货币','贵金属','其他'];
const INCOME_CATEGORIES=['工资奖金','公积金','开会讲课','股票','其他'];
const normalizeType=value=>['银行卡','零钱','外币余额'].includes(value)?'现金':value;
const incomeCategory=s=>/工资|奖金/.test(s)?'工资奖金':/公积金/.test(s)?'公积金':/开会|讲课|讲座/.test(s)?'开会讲课':/股票|股息|分红/.test(s)?'股票':'其他';
module.exports={ACCOUNT_TYPES,INCOME_CATEGORIES,normalizeType,incomeCategory};
