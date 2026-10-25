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
