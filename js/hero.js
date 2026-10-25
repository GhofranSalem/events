// Home hero: full-bleed photo carousel.
// Crossfades every 6 s. Pauses on hover/keyboard focus, when scrolled out of view, when the tab is hidden,
// and with the pause button. With "reduce motion" it never auto-advances (the dots still work).
(()=>{
 const hero=document.getElementById('hero');
 if(!hero)return;
 const slides=[...hero.querySelectorAll('.hero-slide')];
 const dotsHost=document.getElementById('hero-dots');
 const pauseBtn=document.getElementById('hero-pause');
 const caption=document.getElementById('hero-caption');
 const DURATION=6000;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const lang=()=>document.documentElement.lang==='en'?'en':'ar';
 const t=(ar,en)=>lang()==='ar'?ar:en;
 const projects=Array.isArray(window.VISION_PROJECTS)?window.VISION_PROJECTS:[];
 let index=0,timer=null,startedAt=0,remaining=DURATION;
 let userPaused=reduce,hoverPaused=false,offscreen=false;

 hero.style.setProperty('--hero-duration',DURATION+'ms');

 // Load the other photos only after the first one is ready, so the first paint stays fast.
 const loadRest=()=>slides.forEach(s=>{const img=s.querySelector('img');if(img.dataset.src){img.srcset=img.dataset.srcset;img.src=img.dataset.src;delete img.dataset.src;delete img.dataset.srcset}});
 const first=slides[0].querySelector('img');
 if(first.complete)setTimeout(loadRest,300);else first.addEventListener('load',()=>setTimeout(loadRest,300),{once:true});

 // Progress dots (one per photo), also used to jump to a photo.
 const dots=slides.map((s,i)=>{
  const b=document.createElement('button');
  b.type='button';b.className='hero-dot';
  b.append(document.createElement('span'));
  b.addEventListener('click',()=>{go(i);});
  dotsHost.append(b);
  return b;
 });
 if(slides.length<2){dotsHost.hidden=true;pauseBtn.hidden=true}

 const paused=()=>userPaused||hoverPaused||offscreen||document.hidden;

 function updateText(){
  const s=slides[index];
  const p=projects.find(x=>x.id===s.dataset.project);
  if(p){caption.hidden=false;caption.textContent=p.title[lang()];caption.href='project.html?id='+encodeURIComponent(p.id)}
  else caption.hidden=true;
  slides.forEach((sl,i)=>{sl.setAttribute('role','group');sl.setAttribute('aria-roledescription',t('صورة','slide'));sl.setAttribute('aria-label',t(`${i+1} من ${slides.length}`,`${i+1} of ${slides.length}`))});
  dots.forEach((d,i)=>d.setAttribute('aria-label',t(`عرض الصورة ${i+1} من ${slides.length}`,`Show photo ${i+1} of ${slides.length}`)));
  pauseBtn.setAttribute('aria-label',userPaused?t('تشغيل تبديل الصور','Play slideshow'):t('إيقاف تبديل الصور','Pause slideshow'));
  pauseBtn.classList.toggle('is-playing',!userPaused);
 }

 function schedule(){
  clearTimeout(timer);timer=null;
  hero.classList.toggle('is-paused',paused());
  if(paused()||slides.length<2)return;
  startedAt=performance.now();
  timer=setTimeout(()=>go(index+1),remaining);
 }
 function hold(){ // pause the countdown, remember how much time is left
  if(timer){clearTimeout(timer);timer=null;remaining=Math.max(0,remaining-(performance.now()-startedAt))}
  hero.classList.add('is-paused');
 }

 function go(i){
  index=(i+slides.length)%slides.length;
  slides.forEach((s,n)=>{const on=n===index;s.classList.toggle('is-active',on);s.setAttribute('aria-hidden',String(!on))});
  dots.forEach((d,n)=>{
   d.classList.remove('is-active','is-done');
   if(n<index)d.classList.add('is-done');
   d.toggleAttribute('aria-current',n===index);
  });
  void dotsHost.offsetWidth; // restart the fill animation
  dots[index].classList.add('is-active');
  remaining=DURATION;
  updateText();
  schedule();
 }

 pauseBtn.addEventListener('click',()=>{userPaused=!userPaused;if(userPaused)hold();updateText();schedule()});
 hero.addEventListener('mouseenter',()=>{hoverPaused=true;hold()});
 hero.addEventListener('mouseleave',()=>{hoverPaused=false;schedule()});
 hero.addEventListener('focusin',()=>{hoverPaused=true;hold()});
 hero.addEventListener('focusout',e=>{if(!hero.contains(e.relatedTarget)){hoverPaused=false;schedule()}});
 document.addEventListener('visibilitychange',()=>{document.hidden?hold():schedule()});
 if('IntersectionObserver'in window){
  new IntersectionObserver(([e])=>{offscreen=!e.isIntersecting;offscreen?hold():schedule()},{threshold:.15}).observe(hero);
 }
 document.addEventListener('vision-language',updateText);
 go(0);
})();
