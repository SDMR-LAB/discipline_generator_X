/*
  include-loader.js
  - Найти все элементы с атрибутом data-include и загрузить HTML-фрагменты
  - После вставки include'ов загрузить дополнительные скрипты, указанные в data-scripts

  Usage in HTML:
    <div data-include="/includes/header.html"></div>
    <script src="/static/include-loader.js" data-scripts="/static/planner.js"></script>

  Этот файл минималистичен и не использует сторонние зависимости.
*/
(function(){
  'use strict';

  async function loadInclude(el){
    try{
      const url = el.getAttribute('data-include');
      if(!url) return;
      const r = await fetch(url, {cache: 'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const txt = await r.text();
      el.innerHTML = txt;
    }catch(e){
      console.warn('include-loader: failed to load', el.getAttribute('data-include'), e);
    }
  }

  async function run(){
    const includes = Array.from(document.querySelectorAll('[data-include]'));
    await Promise.all(includes.map(loadInclude));

    // Если у этого скрипта указан data-scripts, подгружаем их последовательно
    const currentScript = Array.from(document.querySelectorAll('script')).find(s => s.src.includes('include-loader.js'));
    const scriptsAttr = currentScript && currentScript.getAttribute('data-scripts');
    if(scriptsAttr){
      const scripts = scriptsAttr.split(',').map(s=>s.trim()).filter(Boolean);
      for(const src of scripts){
        await new Promise((resolve,reject)=>{
          const s = document.createElement('script');
          s.src = src;
          s.async = false; // сохранить порядок
          s.onload = resolve;
          s.onerror = ()=>{ console.warn('include-loader: script load failed', src); resolve(); };
          document.head.appendChild(s);
        });
      }
    }
  }

  // Запускаем как можно раньше — если DOM ещё не готов, подождём события
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
