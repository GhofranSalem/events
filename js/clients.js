// Clients wall: each logo rises out of a mask the moment its row scrolls into view, staggered left-to-right
// (right-to-left in Arabic) within the row. A logo waits for its image to arrive, so it never animates in empty.
// Column dividers draw down with it.
// Logos are not lazy-loaded: the hidden-before-reveal clip stops the browser from lazy-loading them. They are small (~150 KB in all) and fetched at low priority.
(()=>{
 const grid=document.querySelector('.client-grid');
 if(!grid)return;
 const cells=[...grid.children];
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(reduce||!('IntersectionObserver'in window)){cells.forEach(c=>c.classList.add('is-in'));return}
 grid.classList.add('will-reveal');
 const show=(cell,delay)=>{
  const img=cell.querySelector('img');
  const go=()=>{cell.style.setProperty('--d',delay+'ms');cell.classList.add('is-in')};
  if(!img||img.complete)go();else{img.addEventListener('load',go,{once:true});img.addEventListener('error',go,{once:true})}
 };
 const io=new IntersectionObserver(entries=>{
  // logos that enter together (one row, or several on a fast scroll) are staggered in reading order
  const now=entries.filter(e=>e.isIntersecting).map(e=>e.target)
   .sort((a,b)=>a.offsetTop-b.offsetTop||(document.documentElement.dir==='rtl'?b.offsetLeft-a.offsetLeft:a.offsetLeft-b.offsetLeft));
  now.forEach((cell,i)=>{io.unobserve(cell);show(cell,Math.min(i,8)*60)});
 },{rootMargin:'0px 0px -6% 0px'});
 cells.forEach(c=>io.observe(c));
})();
