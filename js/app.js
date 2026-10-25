// Home page: service buttons and WhatsApp brief form.
// Language switching lives in language.js.
(()=>{
 const lang=()=>document.documentElement.lang==='en'?'en':'ar';
 const phone='966556143666';

 const service=document.getElementById('service');
 const name=document.getElementById('name');
 document.querySelectorAll('.service-request').forEach(button=>button.addEventListener('click',()=>{
  service.value=button.dataset.service;
  document.getElementById('contact').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  name.focus({preventScroll:true});
 }));

 const form=document.getElementById('brief');
 if(!form)return;
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const person=name.value.trim();
  if(!person){
   name.setCustomValidity(lang()==='ar'?'من فضلك اكتب اسمك.':'Please enter your name.');
   name.reportValidity();
   return;
  }
  const chosen=service.selectedOptions[0].textContent;
  const idea=document.getElementById('idea').value.trim();
  const message=lang()==='ar'
   ?`مرحبًا رؤية الفعاليات، أنا ${person}.\nأرغب في الاستفسار عن: ${chosen}.${idea?'\nالتفاصيل: '+idea:''}`
   :`Hello Vision Events, I’m ${person}.\nI’d like to enquire about: ${chosen}.${idea?'\nDetails: '+idea:''}`;
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
 });
 name.addEventListener('input',()=>name.setCustomValidity(''));
})();

// Services: one panel open at a time, and the photo beside the list follows the open service.
(()=>{
 const items=[...document.querySelectorAll('.service-list details')];
 const photos=[...document.querySelectorAll('.service-visual img')];
 if(!items.length)return;
 items.forEach(d=>d.addEventListener('toggle',()=>{
  if(!d.open)return;
  items.forEach(o=>{if(o!==d)o.open=false}); // fallback for browsers without <details name>
  photos.forEach(p=>p.classList.toggle('is-active',p.dataset.visual===d.dataset.visual));
 }));
})();
