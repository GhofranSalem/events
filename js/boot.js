// Runs in <head> before the page paints: if the visitor chose English last time, switch the page to English/LTR
// straight away (language.js fills in the text) and start loading the English display font early.
// Kept as a file instead of an inline <script> so the Content-Security-Policy can allow scripts from this site only.
try{
 if(localStorage.getItem('vision-language')==='en'){
  const root=document.documentElement;
  root.lang='en';root.dir='ltr';root.classList.add('i18n-pending');
  setTimeout(()=>root.classList.remove('i18n-pending'),800);
  const font=document.createElement('link');
  font.rel='preload';font.as='font';font.type='font/woff2';font.crossOrigin='anonymous';
  font.href='assets/fonts/thmanyahserifdisplay-Regular.woff2';
  document.head.appendChild(font);
 }
}catch(e){}
