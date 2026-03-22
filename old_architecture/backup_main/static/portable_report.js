/* portable_report.js - extracted from portable_report.html inline script */

/* === утилиты === */
function toISODate(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function daysBetween(dateA,dateB){
  const a=new Date(dateA.getFullYear(),dateA.getMonth(),dateA.getDate());
  const b=new Date(dateB.getFullYear(),dateB.getMonth(),dateB.getDate());
  return Math.round((b-a)/86400000);
}
function parseCharacteristics(text){
  const stats={I:0,S:0,W:0,E:0,C:0,H:0,ST:0,'$':0};
  const regex=/([ISWEHC]|ST|\$)\[([-\d.]+)\]/g;
  let match;
  while((match=regex.exec(text))!==null){
    const key=match[1];
    const value=parseFloat(match[2]);
    if(!isNaN(value)) stats[key]=value;
  }
  return stats;
}
function prettifyTopic(t){return t;}
function formatTotalsForReport(t){
  if(!t) return '—';
  const order=[{key:'I',label:'Интеллект'},{key:'S',label:'Сила'},{key:'W',label:'Выносливость'},{key:'E',label:'Эмоции'},{key:'C',label:'Харизма'},{key:'H',label:'Здоровье'},{key:'ST',label:'Стабило'},{key:'$',label:'Рублей'}];
  const parts=[];
  order.forEach(o=>{
    const v=t[o.key];
    if(v!==undefined&&Number(v)!==0){
      const formatted=Number(v).toFixed(2);
      if(o.key==='ST'||o.key==='$') parts.push(`${o.label}:${formatted}`);
      else parts.push(`${o.label} +%${formatted}`);
    }
  });
  return parts.length?parts.join('  '):'—';
}
function calculateTotalStats(parsed){
  const totals={I:0,S:0,W:0,E:0,C:0,H:0,ST:0,'$':0};
  parsed.forEach(item=>{
    if(item.type==='habit'&&item.success){
      for(const k in totals) totals[k]+=item.stats[k]||0;
    } else if(item.type==='composite_habit'){
      item.subtasks.forEach(st=>{ if(st.success){ for(const k in totals) totals[k]+=st.stats[k]||0; } });
    }
  });
  return totals;
}

/* === парсер === */
function parseTextToStructure(text){
  const lines=text.replace(/\r/g,'').split('\n');
  const out=[];
  let currentComposite=null;
  let currentCategory=null;
  for(let i=0;i<lines.length;i++){
    const raw=lines[i];
    const trimmed=raw.trim();
    if(!trimmed){out.push({type:'blank'});continue;}
    if(/^—+$/.test(trimmed)){continue;}
    if(!/^[*+-]/.test(trimmed)&&!trimmed.endsWith(':')){ currentCategory=trimmed; out.push({type:'category',text:trimmed,rawText:raw}); currentComposite=null; continue; }
    if(/^[*]/.test(trimmed)){ const text2=trimmed.replace(/^\*\s*/,''); const comp={type:'composite_habit',text:text2,subtasks:[],category:currentCategory,rawText:raw}; out.push(comp); currentComposite=comp; continue; }
    if(/^[+-]/.test(trimmed)){
      const success=trimmed[0]==='+';
      const rest=trimmed.substring(1).trim();
      const isSubtask=raw.startsWith(' ')||raw.startsWith('\t');
      const dashIndex=rest.indexOf(' — ');
      let name=rest; let quantity=null; let unit=null; let statsText='';
      if(dashIndex!==-1){ name=rest.substring(0,dashIndex).trim(); const afterDash=rest.substring(dashIndex+3).trim(); const statsMatch=afterDash.match(/(.+?)\s+(I\[.+?\])$/); if(statsMatch){ const beforeStats=statsMatch[1]; statsText=statsMatch[2]; const quantityMatch=beforeStats.match(/^(\d+(?:\.\d+)?)\s+(.+)$/); if(quantityMatch){ quantity=parseFloat(quantityMatch[1]); unit=quantityMatch[2]; } } else { const qMatch=afterDash.match(/^(\d+(?:\.\d+)?)\s+(.+)$/); if(qMatch){quantity=parseFloat(qMatch[1]);unit=qMatch[2];} } }
      const stats=parseCharacteristics(statsText);
      const item={type:'habit',success:success,name:name,quantity:quantity,unit:unit,stats:stats,category:currentCategory,rawText:raw};
      if(isSubtask&&currentComposite){ item.isSubtask=true; currentComposite.subtasks.push(item); } else { out.push(item); }
      continue;
    }
    out.push({type:'unknown',text:trimmed,rawText:raw});
  }
  return out;
}

/* === отображение === */
function renderTasks(){
  const tasksList=document.getElementById('tasksList'); tasksList.innerHTML='';
  parsed.forEach(item=>{
    if(item.type==='blank'){ const br=document.createElement('div'); br.style.height='8px'; tasksList.appendChild(br); return; }
    if(item.type==='category'){ const h=document.createElement('div'); h.style.fontWeight='bold'; h.textContent=prettifyTopic(item.text); tasksList.appendChild(h); return; }
    if(item.type==='habit'){ const div=document.createElement('div'); div.className='task'+(item.success?' completed':''); const name=document.createElement('span'); name.className='name'; name.textContent=item.name + (item.quantity?` — ${item.quantity} ${item.unit||''}`:''); div.appendChild(name); const btn=document.createElement('button'); btn.textContent=item.success?'✔':'✖'; btn.onclick=()=>{ item.success=!item.success; renderTasks(); reportOutput.textContent=buildReportText(); }; div.appendChild(btn); tasksList.appendChild(div); return; }
    if(item.type==='composite_habit'){ const div=document.createElement('div'); div.style.fontStyle='italic'; div.textContent=item.text; tasksList.appendChild(div); item.subtasks.forEach(st=>{ const div2=document.createElement('div'); div2.style.paddingLeft='16px'; div2.className='task'+(st.success?' completed':''); const name=document.createElement('span'); name.className='name'; name.textContent=st.name + (st.quantity?` — ${st.quantity} ${st.unit||''}`:''); div2.appendChild(name); const btn=document.createElement('button'); btn.textContent=st.success?'✔':'✖'; btn.onclick=()=>{ st.success=!st.success; renderTasks(); reportOutput.textContent=buildReportText(); }; div2.appendChild(btn); tasksList.appendChild(div2); }); return; }
  });
}

/* === отчёт === */
function buildReportText(){
  const today=new Date();
  const todayISO=toISODate(today);
  const lastDateVal= lastDateEl.value? new Date(lastDateEl.value):null;
  let dayNumber=Number(lastDayEl.value||0);
  if(lastDateVal) dayNumber += daysBetween(lastDateVal,today);
  const totals=calculateTotalStats(parsed);
  const lines=[];
  lines.push(`📅 ДЕНЬ ${dayNumber} · ${todayISO}`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('📊 СУММА ХАРАКТЕРИСТИК (за день)');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push(formatTotalsForReport(totals));
  lines.push('');
  lines.push('━━━━━━━━━━');
  lines.push('🧠 СОСТОЯНИЕ');
  lines.push('━━━━━━━━━━');
  parsed.forEach(item=>{
    if(item.type==='category'){ lines.push(''); lines.push('━━━━━━━━━━'); lines.push(prettifyTopic(item.text)); lines.push('━━━━━━━━━━'); }
    if(item.type==='habit'){ const icon=item.success?'✅':'❌'; let line=`${icon} ${item.name}`; if(item.quantity) line += ` — ${item.quantity} ${item.unit||''}`; lines.push(line); }
    if(item.type==='composite_habit'){ lines.push(''); lines.push('◾ '+item.text); item.subtasks.forEach(st=>{ const icon=st.success?'✅':'❌'; let ln=`    ${icon} ${st.name}`; if(st.quantity) ln += ` — ${st.quantity} ${st.unit||''}`; lines.push(ln); }); }
  });
  return lines.join('\n');
}

/* === инициализация === */
let parsed=[];
const lastDayEl=document.getElementById('lastDay');
const lastDateEl=document.getElementById('lastDate');
const tasksInput=document.getElementById('tasksInput');
const parseBtn=document.getElementById('parseBtn');
const tasksList=document.getElementById('tasksList');
const reportOutput=document.getElementById('reportOutput');
const downloadReport=document.getElementById('downloadReport');

parseBtn.onclick=()=>{
  parsed=parseTextToStructure(tasksInput.value);
  renderTasks();
  reportOutput.textContent=buildReportText();
};

downloadReport.onclick=()=>{
  const txt=reportOutput.textContent;
  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download=`report_${toISODate(new Date())}.txt`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
};

/* sample button (keeps behavior from original) */
document.getElementById('sampleBtn')?.addEventListener('click', ()=>{
  const sampleText = `Здоровье
———————————————
* Физкультура:
    + Приседания — 75 раз I[0.00] S[0.01] W[0.01] E[0.00] C[0.01] H[0.01] ST[1] $[0]
    + Отжимания — 30 раз I[0.00] S[0.01] W[0.01] E[0.00] C[0.01] H[0.01] ST[1] $[0]
    + Планка — 60 секунд I[0.00] S[0.00] W[0.02] E[0.00] C[0.00] H[0.01] ST[1] $[0]
    
+ Пить воду — 2 литра I[0.00] S[0.00] W[0.01] E[0.00] C[0.01] H[0.02] ST[1] $[0]
+ Витамины I[0.01] S[0.00] W[0.00] E[0.00] C[0.00] H[0.01] ST[1] $[-5]

Развитие
———————————————
+ Чтение — 30 страниц I[0.02] S[0.00] W[0.00] E[0.01] C[0.01] H[0.00] ST[1] $[0]
+ Изучение языка — 25 минут I[0.03] S[0.00] W[0.00] E[0.00] C[0.01] H[0.00] ST[1] $[0]

Работа
———————————————
+ Основной проект — 4 часа I[0.05] S[0.00] W[0.01] E[0.00] C[0.02] H[0.00] ST[2] $[50]
+ Планирование дня I[0.01] S[0.00] W[0.00] E[0.01] C[0.00] H[0.00] ST[1] $[0]`;
  tasksInput.value = sampleText;
  parsed = parseTextToStructure(sampleText);
  renderTasks(); reportOutput.textContent = buildReportText();
});
/* === утилиты === */
function toISODate(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function daysBetween(dateA,dateB){
  const a=new Date(dateA.getFullYear(),dateA.getMonth(),dateA.getDate());
  const b=new Date(dateB.getFullYear(),dateB.getMonth(),dateB.getDate());
  return Math.round((b-a)/86400000);
}
function parseCharacteristics(text){
  const stats={I:0,S:0,W:0,E:0,C:0,H:0,ST:0,'$':0};
  const regex=/([ISWEHC]|ST|\$)\[([\-\d.]+)\]/g;
  let match;
  while((match=regex.exec(text))!==null){
    const key=match[1];
    const value=parseFloat(match[2]);
    if(!isNaN(value)) stats[key]=value;
  }
  return stats;
}
function prettifyTopic(t){return t;}
function formatTotalsForReport(totals){
  if(!totals) return '—';
  const order=[{key:'I',label:'Интеллект'},{key:'S',label:'Сила'},{key:'W',label:'Выносливость'},{key:'E',label:'Эмоции'},{key:'C',label:'Харизма'},{key:'H',label:'Здоровье'},{key:'ST',label:'Стабило'},{key:'$',label:'Рублей'}];
  const parts=[];
  order.forEach(o=>{
    const v=totals[o.key];
    if(v!==undefined&&Number(v)!==0){
      const formatted = Number(v).toFixed(2);
      if(o.key==='ST' || o.key==='$') {
        parts.push(`${o.label}:${formatted}`);
      } else {
        parts.push(`${o.label} +%${formatted}`);
      }
    }
  });
  return parts.length?parts.join('  '):'—';
}
function calculateTotalStats(parsed){
  const totals={I:0,S:0,W:0,E:0,C:0,H:0,ST:0,'$':0};
  parsed.forEach(item=>{
    if(item.type==='habit'&&item.success){
      for(const k in totals) totals[k]+=item.stats[k]||0;
    } else if(item.type==='composite_habit'){
      item.subtasks.forEach(st=>{
        if(st.success){
          for(const k in totals) totals[k]+=st.stats[k]||0;
        }
      });
    }
  });
  return totals;
}

/* === парсер === */
function parseTextToStructure(text){
  const lines=text.replace(/\r/g,'').split('\n');
  const out=[];
  let currentComposite=null;
  let currentCategory=null;
  for(let i=0;i<lines.length;i++){
    const raw=lines[i];
    const trimmed=raw.trim();
    if(!trimmed){out.push({type:'blank'});continue;}
    if(/^—+$/.test(trimmed)){continue;}
    if(!/^[*+-]/.test(trimmed)&&!trimmed.endsWith(':')){
      currentCategory=trimmed;
      out.push({type:'category',text:trimmed,rawText:raw});
      currentComposite=null;
      continue;
    }
    if(/^[*]/.test(trimmed)){
      const text2=trimmed.replace(/^\*\s*/, '');
      const comp={type:'composite_habit',text:text2,subtasks:[],category:currentCategory,rawText:raw};
      out.push(comp);
      currentComposite=comp;
      continue;
    }
    if(/^[+-]/.test(trimmed)){
      const success=trimmed[0]==='+';
      const rest=trimmed.substring(1).trim();
      const isSubtask=raw.startsWith(' ')||raw.startsWith('\t');
      const dashIndex=rest.indexOf(' — ');
      let name=rest; let quantity=null; let unit=null; let statsText='';
      if(dashIndex!==-1){
        name=rest.substring(0,dashIndex).trim();
        const afterDash=rest.substring(dashIndex+3).trim();
        const statsMatch=afterDash.match(/(.+?)\s+(I\[.+?\])$/);
        if(statsMatch){
          const beforeStats=statsMatch[1]; statsText=statsMatch[2];
          const quantityMatch=beforeStats.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
          if(quantityMatch){quantity=parseFloat(quantityMatch[1]);unit=quantityMatch[2];}
        } else {
          const qMatch=afterDash.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
          if(qMatch){quantity=parseFloat(qMatch[1]);unit=qMatch[2];}
        }
      }
      const stats=parseCharacteristics(statsText);
      const item={type:'habit',success:success,name:name,quantity:quantity,unit:unit,stats:stats,category:currentCategory,rawText:raw};
      if(isSubtask&&currentComposite){item.isSubtask=true;currentComposite.subtasks.push(item);} else {out.push(item);}      
      continue;
    }
    out.push({type:'unknown',text:trimmed,rawText:raw});
  }
  return out;
}

/* === отображение === */
function renderTasks(){
  const tasksList=document.getElementById('tasksList');
  tasksList.innerHTML='';
  parsed.forEach(item=>{
    if(item.type==='blank'){const br=document.createElement('div');br.style.height='8px';tasksList.appendChild(br);return;}
    if(item.type==='category'){const h=document.createElement('div');h.style.fontWeight='bold';h.textContent=prettifyTopic(item.text);tasksList.appendChild(h);return;}
    if(item.type==='habit'){
      const div=document.createElement('div');div.className='task'+(item.success?' completed':'');
      const name=document.createElement('span');name.className='name';
      name.textContent=item.name + (item.quantity?` — ${item.quantity} ${item.unit||''}`:'');
      div.appendChild(name);
      const btn=document.createElement('button');btn.textContent=item.success?'✔':'✖';
      btn.onclick=()=>{item.success=!item.success;renderTasks();reportOutput.textContent=buildReportText();};
      div.appendChild(btn);
      tasksList.appendChild(div);
      return;
    }
    if(item.type==='composite_habit'){
      const div=document.createElement('div');div.style.fontStyle='italic';div.textContent=item.text;tasksList.appendChild(div);
      item.subtasks.forEach(st=>{
        const div2=document.createElement('div');div2.style.paddingLeft='16px';div2.className='task'+(st.success?' completed':'');
        const name=document.createElement('span');name.className='name';
        name.textContent=st.name + (st.quantity?` — ${st.quantity} ${st.unit||''}`:'');
        div2.appendChild(name);
        const btn=document.createElement('button');btn.textContent=st.success?'✔':'✖';
        btn.onclick=()=>{st.success=!st.success;renderTasks();reportOutput.textContent=buildReportText();};
        div2.appendChild(btn);
        tasksList.appendChild(div2);
      });
      return;
    }
  });
}

/* === отчёт === */
function buildReportText(){
  const today=new Date();
  const todayISO=toISODate(today);
  const lastDateVal= lastDateEl.value? new Date(lastDateEl.value):null;
  let dayNumber=Number(lastDayEl.value||0);
  if(lastDateVal) dayNumber += daysBetween(lastDateVal,today);
  const totals=calculateTotalStats(parsed);
  const lines=[];
  lines.push(`📅 ДЕНЬ ${dayNumber} · ${todayISO}`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('📊 СУММА ХАРАКТЕРИСТИК (за день)');
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push(formatTotalsForReport(totals));
  lines.push('');
  lines.push('━━━━━━━━━━');
  lines.push('🧠 СОСТОЯНИЕ');
  lines.push('━━━━━━━━━━');
  parsed.forEach(item=>{
    if(item.type==='category'){
      lines.push('');
      lines.push('━━━━━━━━━━');
      lines.push(prettifyTopic(item.text));
      lines.push('━━━━━━━━━━');
    }
    if(item.type==='habit'){
      const icon=item.success?'✅':'❌';
      let line=`${icon} ${item.name}`;
      if(item.quantity) line += ` — ${item.quantity} ${item.unit||''}`;
      lines.push(line);
    }
    if(item.type==='composite_habit'){
      lines.push('');
      lines.push('◾ '+item.text);
      item.subtasks.forEach(st=>{
        const icon=st.success?'✅':'❌';
        let ln=`    ${icon} ${st.name}`;
        if(st.quantity) ln += ` — ${st.quantity} ${st.unit||''}`;
        lines.push(ln);
      });
    }
  });
  return lines.join('\n');
}

parseBtn.onclick=()=>{
  parsed=parseTextToStructure(tasksInput.value);
  renderTasks();
  reportOutput.textContent=buildReportText();
};

downloadReport.onclick=()=>{
  const txt=reportOutput.textContent;
  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download=`report_${toISODate(new Date())}.txt`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
};
