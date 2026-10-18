'use strict';
(()=>{
 const standalone=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
 // 主屏幕启动统一回到总览；在应用内切换hash不创建新窗口或整页导航。
 if(standalone()&&location.pathname!=='/login'){try{if(!sessionStorage.getItem('family-standalone-started')){sessionStorage.setItem('family-standalone-started','1');history.replaceState(null,'','/#overview');}}catch{}}
 document.addEventListener('click',e=>{const a=e.target.closest?.('a[data-route]');if(!standalone()||!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const url=new URL(a.href,location.href);if(url.origin!==location.origin||url.pathname!=='/'||!/^#(overview|entry|income|assets|settings)$/.test(url.hash))return;e.preventDefault();location.hash=url.hash;});
})();
