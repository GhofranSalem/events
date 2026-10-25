// Clients wall: each logo is revealed with an upward mask wipe, staggered in a diagonal wave
// across the grid the first time the wall scrolls into view. Column dividers grow in with it.
(()=>{
 const grid=document.querySelector('.client-grid');
 if(!grid)return;
 const cells=[...grid.children];
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(reduce||!('IntersectionObserver'in window)){grid.classList.add('is-in');return}
 grid.classList.add('will-reveal');
 const stagger=()=>{ // delay from each logo's row + column on the current layout (works at any column count)
  const xs=[...new Set(cells.map(c=>c.offsetLeft))].sort((a,b)=>a-b);
  const ys=[...new Set(cells.map(c=>c.offsetTop))].sort((a,b)=>a-b);
  const rtl=document.documentElement.dir==='rtl';
  cells.forEach(c=>{
   let col=xs.indexOf(c.offsetLeft);if(rtl)col=xs.length-1-col;
   c.style.setProperty('--d',((ys.indexOf(c.offsetTop)+col)*70)+'ms');
  });
 };
 new IntersectionObserver((entries,io)=>{
  if(!entries.some(e=>e.isIntersecting))return;
  stagger();
  requestAnimationFrame(()=>grid.classList.add('is-in'));
  io.disconnect();
 },{threshold:.12,rootMargin:'0px 0px -8% 0px'}).observe(grid);
})();
