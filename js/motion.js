(()=>{
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(reduce||!('IntersectionObserver'in window))return;


 /* Typewriter for the page's main heading only (home hero h1, project title h1) — one deliberate motion moment per page.
    Types once when a heading comes into view, then stays. It types again only after the
    heading has left the screen and comes back (scroll away and return), never in a loop. */
 const segmenter='Segmenter'in Intl?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
 const split=s=>segmenter?Array.from(segmenter.segment(s),x=>x.segment):Array.from(s);
 const state=new Map();
 const caret=document.createElement('span');
 caret.className='tw-caret';
 caret.setAttribute('aria-hidden','true');

 function stop(el){
  const st=state.get(el);
  if(st.timer){clearTimeout(st.timer);st.timer=null}
  if(st.nodes){st.nodes.forEach(n=>{if(n.node.isConnected)n.node.data=n.full});st.nodes=null}
  if(caret.parentNode&&el.contains(caret))caret.remove();
  el.classList.remove('is-typing');
  el.style.minHeight='';
  if(st.label){el.removeAttribute('aria-label');st.label=false}
 }

 function type(el){
  stop(el);
  const st=state.get(el);
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
  const nodes=[];let total=0;
  while(walker.nextNode()){const node=walker.currentNode;const parts=split(node.data);nodes.push({node,full:node.data,parts});total+=parts.length}
  if(!total)return;
  if(!el.hasAttribute('aria-label')){el.setAttribute('aria-label',el.innerText.replace(/\s+/g,' ').trim());st.label=true} // screen readers read the whole heading, not the half-typed text
  el.style.minHeight=el.getBoundingClientRect().height+'px'; // keep the page from jumping while letters appear
  nodes.forEach(n=>{n.node.data=''});
  st.nodes=nodes;
  el.classList.add('is-typing');
  const delay=Math.max(45,Math.min(110,2800/total)); // ms per letter: ~3s for a short heading, a bit quicker for long ones
  let i=0,j=0;
  const tick=()=>{
   while(i<nodes.length&&j>=nodes[i].parts.length){i++;j=0}
   if(i>=nodes.length){stop(el);return}
   const n=nodes[i];
   j++;
   n.node.data=n.parts.slice(0,j).join('');
   n.node.parentNode.insertBefore(caret,n.node.nextSibling);
   st.timer=setTimeout(tick,/\s/.test(n.parts[j-1])?delay*.5:delay);
  };
  st.timer=setTimeout(tick,180);
 }

 const watcher=new IntersectionObserver(entries=>{
  entries.forEach(e=>{
   const st=state.get(e.target);
   if(e.isIntersecting){
    st.inView=true;
    if(!st.shown){st.shown=true;type(e.target)}
   }else{
    st.inView=false;
    st.shown=false;   // left the screen: next time it comes back it types again
    stop(e.target);
   }
  });
 },{threshold:0});

 document.querySelectorAll('.hero h1,.project-intro h1').forEach(el=>{
  state.set(el,{timer:null,nodes:null,inView:false,shown:false});
  watcher.observe(el);
 });

 // Language switch replaces the heading text: retype the ones on screen with the new language.
 document.addEventListener('vision-language',()=>{
  state.forEach((st,el)=>{stop(el);if(st.inView&&el.isConnected){st.shown=true;type(el)}});
 });
})();
