'use strict';
(()=>{
 const mode=matchMedia('(display-mode: standalone)'),standalone=()=>navigator.standalone===true||mode.matches,viewport=document.querySelector('meta[name=viewport]'),originalViewport=viewport?.getAttribute('content');
 function sync(){const active=standalone();document.documentElement.dataset.standalone=String(active);if(viewport){const content=active?'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover':originalViewport;if(viewport.getAttribute('content')!==content)viewport.setAttribute('content',content);}}
 sync();window.addEventListener('pageshow',sync);mode.addEventListener?.('change',sync);
 // Only the installed app suppresses page zoom; ordinary browser tabs keep it.
 const stop=e=>{if(standalone()&&e.cancelable)e.preventDefault();};
 for(const event of ['gesturestart','gesturechange','gestureend'])document.addEventListener(event,stop,{passive:false});
 for(const event of ['touchstart','touchmove'])document.addEventListener(event,e=>{if(e.touches?.length>1)stop(e);},{passive:false});
 // Main-screen launch always uses the same entry, while hash tabs stay in-app.
 if(standalone()&&location.pathname!=='/login'){try{if(!sessionStorage.getItem('family-standalone-started')){sessionStorage.setItem('family-standalone-started','1');history.replaceState(null,'','/#overview');}}catch{}}
 document.addEventListener('click',e=>{const a=e.target.closest?.('a[data-route]');if(!standalone()||!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const url=new URL(a.href,location.href);if(url.origin!==location.origin||url.pathname!=='/'||!/^#(overview|entry|income|assets|settings)$/.test(url.hash))return;e.preventDefault();location.hash=url.hash;});
})();
