// Sticky header that steps out of the way while reading (scrolling down) and returns on any scroll up,
// plus highlighting of the nav link for the section on screen. One passive scroll listener, batched in rAF.
(()=>{
 const header=document.querySelector('.header');
 if(!header)return;
 let lastY=scrollY,ticking=false;
 function update(){
  const y=scrollY;
  header.classList.toggle('is-stuck',y>40);
  const goingDown=y>lastY+4, goingUp=y<lastY-4;
  if(goingDown&&y>320&&!header.contains(document.activeElement))header.classList.add('is-hidden');
  else if(goingUp||y<=320)header.classList.remove('is-hidden');
  if(Math.abs(y-lastY)>4)lastY=y;
  ticking=false;
 }
 addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(update)}},{passive:true});
 header.addEventListener('focusin',()=>header.classList.remove('is-hidden'));
 update();

 // Pause the ribbon marquee while it is off screen.
 const ribbon=document.querySelector('.ribbon');
 if(ribbon&&'IntersectionObserver'in window)new IntersectionObserver(([e])=>ribbon.classList.toggle('is-off',!e.isIntersecting)).observe(ribbon);

 // Active section in the nav (home page only).
 const links=[...header.querySelectorAll('nav a[href^="#"]')];
 const sections=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
 if(!sections.length||!('IntersectionObserver'in window))return;
 const io=new IntersectionObserver(entries=>{
  entries.forEach(e=>{
   if(!e.isIntersecting)return;
   links.forEach(a=>a.toggleAttribute('aria-current',a.getAttribute('href')==='#'+e.target.id));
   links.forEach(a=>{if(a.hasAttribute('aria-current'))a.setAttribute('aria-current','true')});
  });
 },{rootMargin:'-45% 0px -50% 0px'});
 sections.forEach(s=>io.observe(s));
})();

// In-page links (menu, logo, "back to top", buttons): scroll to the section without writing "#work" etc. into the
// address bar, so reopening or refreshing the site always starts at the top instead of jumping down to a section.
(()=>{
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const clean=()=>history.replaceState(null,'',location.pathname+location.search);
 document.addEventListener('click',e=>{
  const a=e.target.closest('a[href^="#"]');
  if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  const id=decodeURIComponent(a.getAttribute('href').slice(1));
  const target=id?document.getElementById(id):null;
  if(id&&!target)return;
  e.preventDefault();
  const behavior=reduce?'auto':'smooth';
  if(target){
   target.scrollIntoView({behavior});
   if(!target.matches('a,button,input,select,textarea,[tabindex]'))target.setAttribute('tabindex','-1');
   target.focus({preventScroll:true}); // keyboard and screen-reader users continue from the section they jumped to
  }else scrollTo({top:0,behavior});
  if(location.hash)clean();
 });
 // Refresh always starts at the top. A link that arrives with a section (e.g. a shared "#contact" or
 // "Back to all work" from a project page) still lands on that section once, then the address is cleaned.
 if('scrollRestoration'in history)history.scrollRestoration='manual';
 const hash=decodeURIComponent(location.hash.slice(1));
 const landing=hash&&document.getElementById(hash);
 if(landing){
  const go=()=>landing.scrollIntoView({behavior:'auto'});
  requestAnimationFrame(go);
  addEventListener('load',go,{once:true}); // again after images settle, so the section is not pushed down
 }
 if(location.hash)clean();
})();
