// Team carousel: one person in front with their name and title, the next ones smaller behind on each side.
// Advances every 4 s; pauses on hover / keyboard focus, when off screen, or with "reduce motion".
// Click a person behind, use the arrows, or the keyboard arrow keys to move.
(()=>{
 const section=document.getElementById('team');
 const stage=document.getElementById('team-stage');
 const team=Array.isArray(window.VISION_TEAM)?window.VISION_TEAM:[];
 if(!section||!stage)return;
 if(!team.length){section.hidden=true;return}
 const caption=document.getElementById('team-caption');
 const nameEl=caption.querySelector('.member-name'),roleEl=caption.querySelector('.member-role');
 const prevBtn=document.getElementById('team-prev'),nextBtn=document.getElementById('team-next');
 const INTERVAL=4000;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const lang=()=>document.documentElement.lang==='en'?'en':'ar';
 const t=(ar,en)=>lang()==='ar'?ar:en;
 const n=team.length;
 let active=0,timer=null,hovering=false,offscreen=false;

 const items=team.map((m,i)=>{
  const fig=document.createElement('figure');fig.className='member';
  // Frame -> photo + a solid band at the bottom carrying the name and title (it also hides the photo's cut-off edge).
  const frame=document.createElement('div');frame.className='member-frame';
  const img=new Image();if(m.photoSmall){img.srcset=m.photoSmall+' 500w, '+m.photo+' 1000w';img.sizes='(max-width:700px) 240px, 340px'}img.src=m.photo;img.loading='lazy';img.decoding='async';img.width=400;img.height=500;
  const band=document.createElement('figcaption');band.className='member-band';
  const nm=document.createElement('strong');nm.className='member-name';
  const rl=document.createElement('span');rl.className='member-role';
  band.append(nm,rl);frame.append(img,band);fig.append(frame);
  fig.addEventListener('click',()=>{if(i!==active)go(i)});
  stage.append(fig);
  return {m,fig,img,nm,rl};
 });
 if(n<2){prevBtn.hidden=nextBtn.hidden=true}

 function layout(){
  const rtl=document.documentElement.dir==='rtl'?-1:1;  // "next" sits on the reading-end side
  const narrow=matchMedia('(max-width:700px)').matches;
  const step1=narrow?58:68, step2=narrow?96:118;     // % of a card width
  items.forEach(({fig},i)=>{
   let d=((i-active)%n+n)%n; if(d>n/2)d-=n;           // shortest signed distance from the front person
   const a=Math.abs(d);
   let x=0,s=1,o=1,z=10;
   if(a===1){x=step1*Math.sign(d);s=.78;o=1;z=8}
   else if(a===2&&n>=5&&!narrow){x=step2*Math.sign(d);s=.6;o=.45;z=6}
   else if(a>=1){x=0;s=.5;o=0;z=1}
   fig.style.transform=`translateX(${x*rtl}%) scale(${s})`;
   fig.style.opacity=o;fig.style.zIndex=z;
   fig.classList.toggle('is-center',d===0);
   fig.setAttribute('aria-hidden',String(d!==0));
  });
 }
 function updateText(){
  const m=team[active];
  caption.classList.add('is-changing');
  setTimeout(()=>{nameEl.textContent=m.name[lang()];roleEl.textContent=m.role[lang()];caption.classList.remove('is-changing')},reduce?0:250);
  items.forEach(({m,img,nm,rl})=>{img.alt=m.photo.includes('placeholder')?'':m.name[lang()];nm.textContent=m.name[lang()];rl.textContent=m.role[lang()]});
  prevBtn.setAttribute('aria-label',t('عضو الفريق السابق','Previous team member'));
  nextBtn.setAttribute('aria-label',t('عضو الفريق التالي','Next team member'));
 }
 function schedule(){
  clearTimeout(timer);timer=null;
  if(reduce||hovering||offscreen||document.hidden||n<2)return;
  timer=setTimeout(()=>go(active+1),INTERVAL);
 }
 function go(i){active=(i+n)%n;layout();updateText();schedule()}

 prevBtn.addEventListener('click',()=>go(active-1));
 nextBtn.addEventListener('click',()=>go(active+1));
 section.addEventListener('keydown',e=>{
  if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
  const forward=(e.key==='ArrowLeft')===(document.documentElement.dir==='rtl');
  e.preventDefault();go(active+(forward?1:-1));
 });
 section.addEventListener('mouseenter',()=>{hovering=true;schedule()});
 section.addEventListener('mouseleave',()=>{hovering=false;schedule()});
 section.addEventListener('focusin',()=>{hovering=true;schedule()});
 section.addEventListener('focusout',e=>{if(!section.contains(e.relatedTarget)){hovering=false;schedule()}});
 document.addEventListener('visibilitychange',schedule);
 if('IntersectionObserver'in window)new IntersectionObserver(([e])=>{offscreen=!e.isIntersecting;schedule()},{threshold:.3}).observe(section);
 addEventListener('resize',layout);
 document.addEventListener('vision-language',()=>{layout();updateText()});
 go(0);
})();
