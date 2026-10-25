// Shared language switcher for every page (Arabic / English).
// Page-specific title & description come from data attributes on <html>:
// data-title-ar, data-title-en, data-description-ar, data-description-en
(()=>{
 const root=document.documentElement;
 const button=document.getElementById('language');
 const nav=document.getElementById('nav');
 let current='ar';
 try{current=localStorage.getItem('vision-language')==='en'?'en':'ar'}catch{}

 function apply(){
  root.lang=current;
  root.dir=current==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-ar]').forEach(el=>{el.textContent=el.getAttribute('data-'+current).replace(/\\n/g,'\n')});
  document.querySelectorAll('[data-ar-label]').forEach(el=>el.setAttribute('aria-label',el.getAttribute('data-'+current+'-label')));
  document.querySelectorAll('[data-ar-placeholder]').forEach(el=>{el.placeholder=el.getAttribute('data-'+current+'-placeholder')});
  document.querySelectorAll('[data-ar-alt]').forEach(el=>{el.alt=el.getAttribute('data-'+current+'-alt')});
  const title=root.getAttribute('data-title-'+current);
  if(title)document.title=title;
  const description=root.getAttribute('data-description-'+current);
  const meta=document.querySelector('meta[name="description"]');
  if(description&&meta)meta.content=description;
  if(nav)nav.setAttribute('aria-label',current==='ar'?'التنقل الرئيسي':'Main navigation');
  if(button){
   button.textContent=current==='ar'?'EN':'العربية';
   button.setAttribute('aria-label',current==='ar'?'Switch to English':'التبديل إلى العربية');
  }
  try{localStorage.setItem('vision-language',current)}catch{}
  root.classList.remove('i18n-pending');
  document.dispatchEvent(new Event('vision-language'));
 }

 const year=document.getElementById('year');
 if(year)year.textContent=new Date().getFullYear();

 if(button)button.addEventListener('click',()=>{current=current==='ar'?'en':'ar';apply()});
 apply();
})();
