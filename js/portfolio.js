// Portfolio grid (home page) and project detail page.
// Data comes from projects-data.js (window.VISION_PROJECTS). Projects with "hidden": true are skipped.
(()=>{
 const labels={all:['كل الأعمال','All work'],events:['فعاليات وتجارب','Events & experiences'],exhibitions:['معارض وأجنحة','Exhibitions & pavilions'],sports:['بطولات رياضية','Sports']};
 const records=(Array.isArray(window.VISION_PROJECTS)?window.VISION_PROJECTS:[]).filter(p=>!p.hidden);
 // The grid starts as a single row (one teaser per column); "View all" opens the full list.
 let category='all',expanded=false,query='';
 const rowSize=()=>{const g=document.getElementById('project-grid');const cols=g?getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length:3;return Math.max(cols,2)};
 const lang=()=>document.documentElement.lang==='en'?'en':'ar';
 const t=(ar,en)=>lang()==='ar'?ar:en;
 const pick=obj=>obj?(obj[lang()]||''):'';
 const catLabel=key=>labels[key]?labels[key][lang()==='ar'?0:1]:key;
 const normalize=str=>String(str||'').toLowerCase().replace(/[ً-ٟـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').trim();
 // Turns a YouTube or Vimeo link into an embeddable player URL. Anything else is treated as a video file (mp4).
 // YouTube: watch / youtu.be / shorts / embed links. Vimeo: vimeo.com/ID, vimeo.com/ID/HASH (unlisted), player.vimeo.com/video/ID?h=HASH
 const embedUrl=src=>{
  const s=String(src||'').trim();
  let m=s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if(m)return 'https://www.youtube-nocookie.com/embed/'+m[1]+'?rel=0&modestbranding=1&playsinline=1';
  m=s.match(/player\.vimeo\.com\/video\/(\d+)(?:\?(?:.*&)?h=([\da-f]+))?/i)||s.match(/vimeo\.com\/(?:.*\/)?(\d{6,})(?:\/([\da-f]{6,}))?/i);
  if(m)return 'https://player.vimeo.com/video/'+m[1]+'?'+(m[2]?'h='+m[2]+'&':'')+'dnt=1&title=0&byline=0&portrait=0';
  return null;
 };
 const text=(tag,content,cls)=>{const e=document.createElement(tag);e.textContent=content;if(cls)e.className=cls;return e};
 const grid=document.getElementById('project-grid');
 const detailHost=document.getElementById('project-detail');

 /* ---------- Grid (home page) ---------- */
 const filterButtons=new Map();
 const filtersHost=document.getElementById('project-filters');
 if(filtersHost){
  Object.keys(labels).forEach(key=>{
   const b=document.createElement('button');
   b.type='button';
   b.onclick=()=>{category=key;renderGrid()};
   filtersHost.append(b);
   filterButtons.set(key,b);
  });
 }
 function renderGrid(focusFrom){
  // Filter buttons are created once (so keyboard focus stays on the pressed button); here we only refresh label + state.
  filterButtons.forEach((b,key)=>{b.textContent=catLabel(key);b.setAttribute('aria-pressed',String(key===category))});
  const q=normalize(query);
  const found=records.filter(p=>{
   if(category!=='all'&&p.category!==category)return false;
   if(!q)return true;
   const haystack=normalize([p.title?.ar,p.title?.en,p.description?.ar,p.description?.en,...(p.services||[]).flatMap(s=>[s.ar,s.en])].join(' '));
   return haystack.includes(q);
  });
  const open=expanded||!!q; // a search always shows every match
  const limit=open?found.length:rowSize();
  grid.replaceChildren();
  found.slice(0,limit).forEach((p,i)=>{
   const a=document.createElement('a');a.href='project.html?id='+encodeURIComponent(p.id);a.className='project-card';
   const frame=document.createElement('div');frame.className='project-image';
   const img=new Image();img.src=p.thumb;img.alt='';img.loading='lazy';img.decoding='async';img.width=720;img.height=500;
   frame.append(img);
   const mark=document.createElement('span');mark.className='project-mark';mark.setAttribute('aria-hidden','true');
   frame.append(mark);
   a.append(frame,text('small',catLabel(p.category)),text('h3',pick(p.title)));
   if(typeof focusFrom==='number'&&i>=focusFrom){a.classList.add('is-new');a.style.setProperty('--i',i-focusFrom)}
   grid.append(a);
  });
  const countEl=document.getElementById('project-count');
  if(countEl)countEl.textContent=t(`${found.length} مشروع وتجربة`,`${found.length} projects & experiences`);
  if(!found.length)grid.append(text('p',t('لا توجد نتائج بهذا الاسم. جرّب كلمة أخرى.','No matches. Try another keyword.')));
  const moreBtn=document.getElementById('more-projects');
  if(moreBtn){
   moreBtn.hidden=!!q||found.length<=rowSize();
   moreBtn.textContent=expanded?t('عرض أقل','Show less'):t(`عرض كل الأعمال (${found.length})`,`View all work (${found.length})`);
   moreBtn.setAttribute('aria-expanded',String(expanded));
  }
  // After "More": move keyboard focus to the first newly added project (the More button may have just disappeared).
  if(typeof focusFrom==='number'&&grid.children[focusFrom])grid.children[focusFrom].focus({preventScroll:true});
 }

 /* ---------- Lightbox ---------- */
 let activeImages=[],activeIndex=0;
 const lightbox=document.createElement('dialog');lightbox.className='lightbox';
 const close=text('button','×','lightbox-close'),prev=text('button','←','lightbox-prev'),next=text('button','→','lightbox-next'),full=Object.assign(new Image(),{alt:''}),counter=text('span','','lightbox-counter');
 close.type=prev.type=next.type='button';
 lightbox.append(close,prev,full,next,counter);
 document.body.append(lightbox);
 function lightboxLabels(){
  close.setAttribute('aria-label',t('إغلاق','Close'));
  prev.setAttribute('aria-label',t('الصورة السابقة','Previous image'));
  next.setAttribute('aria-label',t('الصورة التالية','Next image'));
  if(activeImages.length)full.alt=t(`صورة ${activeIndex+1} من المشروع`,`Project image ${activeIndex+1}`);
 }
 function showImage(index){
  if(!activeImages.length)return;
  activeIndex=(index+activeImages.length)%activeImages.length;
  full.src=activeImages[activeIndex];
  const multiple=activeImages.length>1;
  prev.hidden=next.hidden=counter.hidden=!multiple;
  counter.textContent=`${activeIndex+1} / ${activeImages.length}`;
  lightboxLabels();
 }
 const openAt=i=>{showImage(i);lightbox.showModal()};
 close.onclick=()=>lightbox.close();
 prev.onclick=()=>showImage(activeIndex-1);
 next.onclick=()=>showImage(activeIndex+1);
 lightbox.addEventListener('click',e=>{if(e.target===lightbox)lightbox.close()});
 lightbox.addEventListener('keydown',e=>{
  if(activeImages.length<=1)return;
  if(e.key==='ArrowRight'){e.preventDefault();showImage(activeIndex+1)}
  if(e.key==='ArrowLeft'){e.preventDefault();showImage(activeIndex-1)}
 });

 /* ---------- Project detail page ----------
    Built once; a language switch only updates the text, so playing videos are not interrupted. */
 const detail={};
 function buildDetail(){
  const p=records.find(r=>r.id===new URLSearchParams(location.search).get('id'));
  detail.project=p;
  detailHost.replaceChildren();
  if(!p){
   detail.notFound=text('h1','');
   detail.notFoundLink=document.createElement('a');detail.notFoundLink.href='index.html#work';detail.notFoundLink.className='button gold project-cta';
   detailHost.append(detail.notFound,detail.notFoundLink);
   return;
  }
  const intro=text('div','','project-intro');
  detail.category=text('p','','eyebrow');
  detail.title=text('h1','');
  detail.description=text('p','','project-description');
  intro.append(detail.category,detail.title,detail.description);
  detailHost.append(intro);

  activeImages=p.images||[];
  if(activeImages.length){
   // A real button so the cover opens with keyboard / screen readers too, like the gallery images.
   detail.coverButton=document.createElement('button');
   detail.coverButton.type='button';
   detail.coverButton.className='project-cover-button';
   detail.cover=new Image();
   detail.cover.src=activeImages[0];
   detail.cover.className='project-cover';
   detail.cover.fetchPriority='high';
   detail.coverButton.append(detail.cover);
   detail.coverButton.onclick=()=>openAt(0);
   detailHost.append(detail.coverButton);
  }

  if(p.services&&p.services.length){
   const scope=text('section','','project-scope');
   detail.scopeTitle=text('h2','');
   const ul=document.createElement('ul');
   detail.services=p.services.map(()=>{const li=text('li','');ul.append(li);return li});
   scope.append(detail.scopeTitle,ul);
   detailHost.append(scope);
  }

  // Gallery shows the remaining images (the first one is already the cover).
  detail.galleryButtons=[];
  if(activeImages.length>1){
   const gallery=text('div','','detail-gallery');
   activeImages.slice(1).forEach((src,n)=>{
    const i=n+1;
    const b=document.createElement('button');
    b.type='button';
    const img=new Image();
    img.src=src;img.loading='lazy';img.decoding='async';
    b.append(img);
    b.onclick=()=>openAt(i);
    gallery.append(b);
    detail.galleryButtons.push({b,img,i});
   });
   detailHost.append(gallery);
  }

  detail.videos=[];
  if(p.videos&&p.videos.length){
   detail.filmHeading=text('h2','','film-heading');
   detailHost.append(detail.filmHeading);
   p.videos.forEach(src=>{
    const embed=embedUrl(src);
    let v;
    if(embed){
     v=document.createElement('iframe');
     v.src=embed;
     v.loading='lazy';
     v.allow='accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';
     v.allowFullscreen=true;
     v.referrerPolicy='strict-origin-when-cross-origin';
     v.className='project-video project-embed';
    }else{
     v=document.createElement('video');
     v.controls=true;v.preload='metadata';v.playsInline=true;
     if(activeImages[0])v.poster=activeImages[0];
     v.src=src;v.className='project-video';
    }
    detailHost.append(v);
    detail.videos.push(v);
   });
  }

  detail.cta=document.createElement('a');
  detail.cta.className='button gold project-cta';
  detail.cta.target='_blank';
  detail.cta.rel='noopener';
  detailHost.append(detail.cta);
 }

 function updateDetailText(){
  const p=detail.project;
  if(!p){
   document.title=t('المشروع غير موجود | رؤية الفعاليات','Project not found | Vision Events');
   detail.notFound.textContent=t('المشروع غير موجود','Project not found');
   detail.notFoundLink.textContent=t('تصفّح كل الأعمال','Browse all work');
   return;
  }
  const title=pick(p.title);
  const description=pick(p.description);
  document.title=title+' | '+t('رؤية الفعاليات','Vision Events');
  const meta=document.querySelector('meta[name="description"]');
  if(meta&&description)meta.content=description;
  detail.category.textContent=catLabel(p.category);
  detail.title.textContent=title;
  detail.description.textContent=description;
  detail.description.hidden=!description;
  if(detail.cover){
   detail.cover.alt=title;
   detail.coverButton.setAttribute('aria-label',t(`تكبير الصورة 1 — ${title}`,`Enlarge image 1 — ${title}`));
  }
  if(detail.scopeTitle){
   detail.scopeTitle.textContent=t('تفاصيل تصنع التجربة','Behind the experience');
   p.services.forEach((s,i)=>{detail.services[i].textContent=pick(s)});
  }
  detail.galleryButtons.forEach(({b,img,i})=>{
   b.setAttribute('aria-label',t(`تكبير الصورة ${i+1}`,`Enlarge image ${i+1}`));
   img.alt=title+' — '+(i+1);
  });
  if(detail.filmHeading)detail.filmHeading.textContent=t('شاهد التجربة','Watch the experience');
  detail.videos.forEach(v=>v.tagName==='IFRAME'?v.title=title:v.setAttribute('aria-label',title));
  detail.cta.href='https://wa.me/966556143666?text='+encodeURIComponent(t('مرحبًا، أرغب في مناقشة فعالية مشابهة لـ: ','Hello, I’d like to discuss an event similar to: ')+title);
  detail.cta.textContent=t('لنصنع تجربتك القادمة عبر واتساب ↗','Let’s create your next experience on WhatsApp ↗');
  detail.cta.setAttribute('aria-label',t('لنصنع تجربتك القادمة عبر واتساب (يفتح في نافذة جديدة)','Let’s create your next experience on WhatsApp (opens in a new tab)'));
  lightboxLabels();
 }

 /* ---------- Wiring ---------- */
 document.getElementById('project-search')?.addEventListener('input',e=>{query=e.target.value;renderGrid()});
 document.getElementById('more-projects')?.addEventListener('click',()=>{
  expanded=!expanded;
  if(expanded){renderGrid(rowSize())} // focus + reveal start at the first newly shown project
  else{renderGrid();const w=document.getElementById('work');if(w&&w.getBoundingClientRect().top<0)w.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 });
 // Collapsed view follows the column count (3 / 2 / phone) when the window is resized.
 let lastCols=0;addEventListener('resize',()=>{const c=rowSize();if(c!==lastCols){lastCols=c;if(!expanded&&grid)renderGrid()}});
 if(grid){
  renderGrid();
  document.addEventListener('vision-language',()=>renderGrid());
 }else if(detailHost){
  buildDetail();
  updateDetailText();
  document.addEventListener('vision-language',updateDetailText);
 }
})();
