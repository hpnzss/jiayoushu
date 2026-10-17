(function(root){
  let count=0;
  function newId(){
    const bytes=new Uint8Array(16);
    if(root.crypto?.getRandomValues){root.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
    // 这里只用于提交去重编号，不用于登录、密码或授权。
    return 'record-'+Date.now().toString(36)+'-'+(++count).toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  }
  function product(quantity,price){
    function scaled(s){if(!/^(0|[1-9]\d{0,10})(\.\d{1,6})?$/.test(s))throw Error('数量与单价需为非负数字，最多6位小数。');const [a,b='']=s.split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));}
    const n=(scaled(quantity)*scaled(price)+5000000000n)/10000000000n;if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('总价值超出计算范围。');return (n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');
  }
  const incomeCategory=s=>/工资|奖金/.test(s)?'工资奖金':/公积金/.test(s)?'公积金':/开会|讲课|讲座/.test(s)?'开会讲课':/股票|股息|分红/.test(s)?'股票':'其他';
  root.FamilyClient={newId,product,incomeCategory};
})(typeof globalThis!=='undefined'?globalThis:this);
