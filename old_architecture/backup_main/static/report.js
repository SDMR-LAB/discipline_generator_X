// report.js
// Externalized from report_generator.html - full implementation preserved and slightly cleaned.

// Утилитарные функции
function toISODate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function formatTotalsForReport(totals) {
  if (!totals) return '—';
  const order = [
    { key: 'I', label: 'Интеллект' },
    { key: 'S', label: 'Сила' },
    { key: 'W', label: 'Выносливость' },
    { key: 'E', label: 'Эмоции' },
    { key: 'C', label: 'Харизма' },
    { key: 'H', label: 'Здоровье' },
    { key: 'ST', label: 'Стабило' },
    { key: '$', label: 'Рублей' }
  ];
  const parts = [];
  let sumoftotals = 0;
  order.forEach(o => {
    const v = totals[o.key];
    if (v !== undefined && Number(v) !== 0) {
      if (o.key === 'ST' || o.key === '$') parts.push(`${o.label}:${Number(v).toFixed(2)}`);
      else {
        parts.push(`${o.label} +%${Number(v).toFixed(2)}`);
        sumoftotals += Number(v);
      }
    }
  });
  if (sumoftotals > 0) parts.push(`\n\nЯ стал лучше на +%${Number(sumoftotals).toFixed(2)}`);
  return parts.length ? parts.join('  ') : '—';
}

function daysBetween(dateA, dateB){
  const a = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const b = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((b - a) / 86400000);
}

function parseCharacteristics(text) {
  const stats = {
    I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0
  };
  const regex = /([ISWEHC]|ST|\$)\[([-\d.]+)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1];
    const value = parseFloat(match[2]);
    if (!isNaN(value)) stats[key] = value;
  }
  return stats;
}

function formatStats(stats) {
  return `I[${stats.I.toFixed(2)}] S[${stats.S.toFixed(2)}] W[${stats.W.toFixed(2)}] E[${stats.E.toFixed(2)}] C[${stats.C.toFixed(2)}] H[${stats.H.toFixed(2)}] ST[${Number(stats.ST).toFixed(2)}] $[${stats.$}]`;
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

function renderTotalStats(totals) {
  const el = document.getElementById('totalStats');
  if (!el) return;
  const order = ['I', 'S', 'W', 'E', 'C', 'H', 'ST', '$'];
  el.innerHTML = order.map(k => `<div class="stat-item"><strong>${k}:</strong> ${totals[k].toFixed(2)}</div>`).join('');
}

// Сначала объявляем все переменные (state)
let todayDisplay, currentDayDisplay, diffDaysEl, lastDayEl, lastDateEl, tasksInput, parseBtn, tasksList;
let makeReportBtn, reportOutput, copyReport, downloadReport, saveBtn, loadBtn, clearBtn, resetStatusesBtn, sampleBtn;
let completedCountEl, totalCountEl, percentDoneEl, stateSelect, stateDesc, thoughtsInput;
let habitsCatalog = [];
let combosCatalog = [];
let appliedCombos = [];
let currentDayFromDB = null;
let streaksData = {};
let parsed = [];
let dailyComparison = null;
let allTimeTotals = null;
let emotionMorning = null;
let dailyQuestions = [];

// Константы
const STATE_DESCRIPTIONS = {
  WORK: 'WORK — рабочий день. Фокус: выполнение задач, стандартный ритм.',
  VAC: 'VAC — выходной/отдых. Фокус: восстановление, минимальные ритуалы.',
  SICK: 'SICK — болезнь/восстановление. Фокус: отдых и лечение, низкая активность.',
  OTHER: 'OTHER — другое. Используй для специальных случаев.'
};

const EMOTIONS = ['Спокойствие','Фокус','Тревога','Усталость','Злость','Радость','Пустота','Воодушевление'];

const CONTROL_QUESTIONS = [
  'Я действовал сегодня честно по отношению к себе?',
  'Я сделал максимум возможного в текущих условиях?',
  'Я не предал свои ценности сегодня?',
  'Я управлял вниманием, а не плыл по инерции?',
  'Я завершал задачи, а не имитировал деятельность?',
  'Этот день укрепил мою систему жизни?'
];

const STORAGE_KEY = 'discipline_report_v2';

// Функции работы с БД и UI
function loadCombinations(){
  fetch('/api/combinations')
    .then(r => r.json())
    .then(data => {
      if (data.status === 'success') {
        combosCatalog = data.data || [];
        updateCombinationsModal();
        renderMeta();
        updateReportOutput();
      }
    })
    .catch(err => console.warn('Ошибка загрузки сочетаний:', err));
}

function loadHabitsCatalog() {
  fetch('/api/habits')
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        habitsCatalog = data.data;
        updateHabitCatalogModal();
        loadStreaks();
      }
    })
    .catch(error => console.error('Ошибка загрузки привычек:', error));
}

function loadStreaks() {
  return fetch('/api/stats/streaks')
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        streaksData = {};
        data.data.forEach(streak => {
          const key = String(streak.habit_id);
          streaksData[key] = {
            current: Number(streak.current_streak) || 0,
            longest: Number(streak.longest_streak) || 0
          };
        });
        if (parsed.length > 0) {
          renderTasks();
        }
      }
    })
    .catch(error => console.error('Ошибка загрузки стриков:', error));
}

function loadPeriodStats(period) {
  fetch(`/api/stats/period?period=${period}`)
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        displayPeriodStats(data, period);
      }
    })
    .catch(error => console.error('Ошибка загрузки статистики:', error));
}

function displayPeriodStats(data, period) {
  const container = document.getElementById('periodStatsDisplay');
  if (!container) return;
  const periodNames = { week: 'неделю', month: 'месяц', all: 'все время' };
  let html = `<strong>За ${periodNames[period]}:</strong> `;
  html += `${data.stats.days_count || 0} дней, `;
  html += `I:${data.stats.avg_i ? data.stats.avg_i.toFixed(2) : '0.00'} `;
  html += `S:${data.stats.avg_s ? data.stats.avg_s.toFixed(2) : '0.00'} `;
  html += `W:${data.stats.avg_w ? data.stats.avg_w.toFixed(2) : '0.00'}`;
  if (data.comparison) {
    html += '<br>Сравнение: ';
    const changes = [];
    Object.keys(data.comparison).forEach(key => {
      if (data.comparison[key] !== '→') {
        changes.push(`${key}${data.comparison[key]}`);
      }
    });
    if (changes.length > 0) html += changes.join(' ');
    else html += 'без изменений';
  }
  container.innerHTML = html;
}

function loadDatesFromDB() {
  fetch('/api/stats/period?period=all')
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success' && data.days_data) {
        updateDateSelect(data.days_data);
      }
    })
    .catch(error => console.error('Ошибка загрузки дат:', error));
}

function updateDateSelect(daysData) {
  const select = document.getElementById('dbDateSelect');
  if (!select) return;
  while (select.options.length > 1) select.remove(1);
  const dates = [...new Set(daysData.map(day => day.date))].sort().reverse();
  dates.forEach(date => { const option = document.createElement('option'); option.value = date; option.textContent = date; select.appendChild(option); });
}

function loadDayFromDB() {
  const date = document.getElementById('dbDateSelect').value;
  if (!date) return;
  fetch(`/api/completions/${date}`)
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        currentDayFromDB = data;
        currentDayFromDB.requested_date = date;
        updateUIFromDB();
      }
    })
    .catch(error => console.error('Ошибка загрузки дня:', error));
}

function updateUIFromDB() {
  if (!currentDayFromDB) return;
  if (stateSelect) stateSelect.value = currentDayFromDB.day_data?.state || 'WORK';
  if (thoughtsInput) thoughtsInput.value = currentDayFromDB.day_data?.thoughts || '';
  if (currentDayFromDB.day_data?.emotion_morning) {
    document.querySelectorAll('#emotionMorning button').forEach(btn => btn.classList.toggle('active', btn.textContent === currentDayFromDB.day_data.emotion_morning));
  }
  let text = '';
  let currentCategory = null;
  let dbFriction = 1; let dbMult = 1.0;
  if (currentDayFromDB.day_data && currentDayFromDB.day_data.friction_index != null) {
    dbFriction = Number(currentDayFromDB.day_data.friction_index) || 1;
    dbMult = 1.0 + (dbFriction - 1) * (1.0 / 9.0);
  }
  currentDayFromDB.habits.forEach(habit => {
    if (habit.category !== currentCategory) {
      if (currentCategory) text += '\n';
      currentCategory = habit.category;
      text += `${habit.category}\n———————————————\n`;
    }
    const sign = habit.success ? '+' : '-';
    const quantity = habit.quantity ? ` — ${habit.quantity} ${habit.unit || ''}` : '';
    const stats = formatStats({ I: habit.i / dbMult, S: habit.s / dbMult, W: habit.w / dbMult, E: habit.e / dbMult, C: habit.c / dbMult, H: habit.h / dbMult, ST: habit.st / dbMult, $: habit.money / dbMult });
    let displayName = habit.habit_name || '';
    if(habit.notes && String(habit.notes).trim()){
      const raw = String(habit.notes).trim();
      const match = raw.match(/^(.*?)\s*[-–—|:]{1,3}\s*(.+)$/);
      if(match){ const proj = prettifyTopic(match[1]); const fname = match[2].trim(); displayName = `${proj} — ${fname}`; }
      else displayName = raw;
    } else {
      if (String(habit.habit_name || '').startsWith('Работа по проекту')){
        const hn = String(habit.habit_name || ''); const m = hn.match(/\(([^)]+)\)/);
        if(m && m[1]){ const inner = m[1]; const im = inner.match(/^(.*?)\s*[-–—|:]{1,3}\s*(.+)$/); if(im){ const proj = prettifyTopic(im[1]); const fname = im[2].trim(); displayName = `${proj} — ${fname}`; } else displayName = inner; }
        else displayName = hn;
      } else displayName = habit.habit_name;
    }
    const prefix = (String(habit.habit_name||'').startsWith('Работа по проекту')) ? 'Работа по проекту: ' : '';
    text += `${sign} ${prefix}${displayName}${quantity} ${stats}\n`;
  });
  if (tasksInput) tasksInput.value = text;
  const frictionInput = document.getElementById('frictionIndex'); const frictionValue = document.getElementById('frictionValue');
  if (frictionInput) {
    if (currentDayFromDB && currentDayFromDB.day_data && currentDayFromDB.day_data.friction_index != null) { frictionInput.value = currentDayFromDB.day_data.friction_index; if (frictionValue) frictionValue.textContent = frictionInput.value; frictionInput.disabled = true; } else frictionInput.disabled = false;
  }
  const dbDayNumber = Number(currentDayFromDB.day_data.day_number || 0);
  if (!isNaN(dbDayNumber) && dbDayNumber > 0) {
    if (currentDayDisplay) currentDayDisplay.textContent = String(dbDayNumber);
    if (lastDateEl && currentDayFromDB.requested_date) lastDateEl.value = currentDayFromDB.requested_date;
    const reportDateEl = document.getElementById('reportDate'); if (reportDateEl && currentDayFromDB.requested_date) reportDateEl.value = currentDayFromDB.requested_date;
    if (lastDayEl) lastDayEl.value = String(dbDayNumber);
  }
  parsed = parseTextToStructure(text);
  renderTasks(); renderMeta(); loadDailyComparison();
}

function loadAllTimeTotals() {
  fetch(`/api/stats/period?period=all`)
    .then(r => r.json())
    .then(data => {
      if (data && data.status === 'success') {
        const s = data.stats || {};
        if (s.sum_i !== undefined || s.sum_s !== undefined || s.sum_w !== undefined) {
          allTimeTotals = { I: Number(s.sum_i || 0), S: Number(s.sum_s || 0), W: Number(s.sum_w || 0), E: Number(s.sum_e || 0), C: Number(s.sum_c || 0), H: Number(s.sum_h || 0), ST: Number(s.sum_st || 0), $: Number(s.sum_money || 0) };
          updateReportOutput(); return;
        }
        if (Array.isArray(data.days_data)) {
          const tot = { I:0, S:0, W:0, E:0, C:0, H:0, ST:0, $:0 };
          data.days_data.forEach(day => {
            if (day.totals) { tot.I += Number(day.totals.I || day.totals.i || 0); tot.S += Number(day.totals.S || day.totals.s || 0); tot.W += Number(day.totals.W || day.totals.w || 0); tot.E += Number(day.totals.E || day.totals.e || 0); tot.C += Number(day.totals.C || day.totals.c || 0); tot.H += Number(day.totals.H || day.totals.h || 0); tot.ST += Number(day.totals.ST || day.totals.st || 0); tot.$ += Number(day.totals.$ || day.totals.money || 0); return; }
            if (day.habits && Array.isArray(day.habits)) { day.habits.forEach(h => { tot.I += Number(h.i || h.I || 0); tot.S += Number(h.s || h.S || 0); tot.W += Number(h.w || h.W || 0); tot.E += Number(h.e || h.E || 0); tot.C += Number(h.c || h.C || 0); tot.H += Number(h.h || h.H || 0); tot.ST += Number(h.st || h.ST || 0); tot.$ += Number(h.money || h.$ || 0); }); return; }
            tot.I += Number(day.I || day.i || 0); tot.S += Number(day.S || day.s || 0); tot.W += Number(day.W || day.w || 0); tot.E += Number(day.E || day.e || 0); tot.C += Number(day.C || day.c || 0); tot.H += Number(day.H || day.h || 0); tot.ST += Number(day.ST || day.st || 0); tot.$ += Number(day.sum_money || day.sum_money || day.money || 0);
          });
          allTimeTotals = tot; updateReportOutput(); return;
        }
      }
      allTimeTotals = null; updateReportOutput();
    })
    .catch(err => { console.warn('Не удалось загрузить суммарные характеристики за всё время:', err); allTimeTotals = null; updateReportOutput(); });
}

function loadDailyComparison() {
  const reportDateEl = document.getElementById('reportDate');
  const cmpDate = reportDateEl && reportDateEl.value ? toISODate(new Date(reportDateEl.value)) : toISODate(new Date());
  fetch(`/api/stats/daily_comparison?date=${cmpDate}`)
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success' && data.comparison) {
        dailyComparison = data.comparison;
        Object.keys(data.comparison).forEach(key => {
          const changeEl = document.getElementById(`change-${key}`);
          if (changeEl) {
            const sign = data.comparison[key];
            changeEl.textContent = sign;
            changeEl.className = `stat-change ${sign === '↑' ? 'up' : sign === '↓' ? 'down' : 'same'}`;
          }
        });
        updateReportOutput();
      } else { dailyComparison = null; updateReportOutput(); }
    })
    .catch(error => { console.error('Ошибка загрузки сравнения:', error); dailyComparison = null; updateReportOutput(); });
}

function saveDayToDB() {
  const date = (document.getElementById('reportDate') && document.getElementById('reportDate').value) || toISODate(new Date());
  const state = stateSelect ? stateSelect.value : 'WORK';
  const thoughts = thoughtsInput ? thoughtsInput.value : '';
  const emotionBtn = document.querySelector('#emotionMorning button.active');
  const emotionMorning = emotionBtn ? emotionBtn.textContent : null;
  const habitsData = [];
  parsed.forEach(item => {
    if (item.type === 'habit' && !item.isSubtask) {
      const catalogHabit = habitsCatalog.find(h => h.name === item.name && h.category === item.category);
      if (catalogHabit) {
        habitsData.push({ habit_id: catalogHabit.id, quantity: item.quantity, success: item.success, i: item.stats.I, s: item.stats.S, w: item.stats.W, e: item.stats.E, c: item.stats.C, h: item.stats.H, st: item.stats.ST, money: item.stats.$ });
      }
    }
  });
  const postData = { date: date, state: state, emotion_morning: emotionMorning, thoughts: thoughts, habits: habitsData, day_number: currentDayDisplay ? parseInt(currentDayDisplay.textContent) || 1 : 1, completed_count: completedCountEl ? parseInt(completedCountEl.textContent) || 0 : 0, total_count: totalCountEl ? parseInt(totalCountEl.textContent) || 0 : 0, totals: calculateTotalStats(parsed), friction_index: parseInt(document.getElementById('frictionIndex')?.value || 1) };
  fetch('/api/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(postData), })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        alert('Данные сохранены в базу данных!');
        const frictionInput = document.getElementById('frictionIndex'); if (frictionInput) frictionInput.disabled = true; loadDatesFromDB(); loadStreaks(); setTimeout(() => { loadStreaks(); renderTasks(); }, 500);
      } else alert('Ошибка: ' + data.message);
    })
    .catch(error => { console.error('Ошибка:', error); alert('Ошибка сохранения: ' + error.message); });
}

function updateCombinationsModal(){
  const list = document.getElementById('comboList'); const selA = document.getElementById('comboA'); const selB = document.getElementById('comboB');
  if(!list || !selA || !selB) return; list.innerHTML = ''; selA.innerHTML = '<option value="">—</option>'; selB.innerHTML = '<option value="">—</option>';
  habitsCatalog.forEach(h=>{ const opt = `<option value="${h.id}">${h.name} (${h.category})</option>`; selA.insertAdjacentHTML('beforeend', opt); selB.insertAdjacentHTML('beforeend', opt); });
  if(combosCatalog.length === 0) list.innerHTML = '<div class="small">Сочетаний нет</div>';
  else combosCatalog.forEach(c=>{ const name = c.name || `${c.name_a || ''} + ${c.name_b || ''}`; const html = `<div style="padding:6px;border-bottom:1px solid #eee">\n            <strong>${name}</strong><div class="small">(${c.name_a || c.habit_a} ↔ ${c.name_b || c.habit_b})</div>\n            <div class="small">${formatStats({I:c.i||0,S:c.s||0,W:c.w||0,E:c.e||0,C:c.c||0,H:c.h||0,ST:c.st||0,$:c.money||0})}</div>\n          </div>`; list.insertAdjacentHTML('beforeend', html); });
}

function openCombos(){ showModal('comboModal'); updateCombinationsModal(); }
function createCombo(){ const a=document.getElementById('comboA').value; const b=document.getElementById('comboB').value; if(!a||!b||a===b){ alert('Выберите две разные привычки'); return; } const payload={ name: document.getElementById('comboName').value||null, habit_a: Math.min(Number(a),Number(b)), habit_b: Math.max(Number(a),Number(b)), i: parseFloat(document.getElementById('comboI').value||0), s: parseFloat(document.getElementById('comboS').value||0), w: parseFloat(document.getElementById('comboW').value||0), e: parseFloat(document.getElementById('comboE').value||0), c: parseFloat(document.getElementById('comboC').value||0), h: parseFloat(document.getElementById('comboH').value||0), st: parseFloat(document.getElementById('comboST').value||0), money: parseFloat(document.getElementById('comboMoney').value||0) }; fetch('/api/combinations',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(r=>r.json()).then(data=>{ if(data.status==='success'){ alert('Создано'); loadCombinations(); hideModal('comboModal'); } else alert('Ошибка: '+(data.message||'')); }).catch(err=>{ console.warn(err); alert('Ошибка'); }); }

function updateHabitCatalogModal() {
  const container = document.getElementById('habitCatalogList');
  if (!container) return;

  container.innerHTML = '';

  const habitsByCategory = {};

  habitsCatalog.forEach(habit => {
    if (!habitsByCategory[habit.category]) {
      habitsByCategory[habit.category] = [];
    }
    habitsByCategory[habit.category].push(habit);
  });

  Object.keys(habitsByCategory)
    .sort()
    .forEach(category => {

      const categoryDiv = document.createElement('div');
      categoryDiv.className = 'category-header';
      categoryDiv.textContent = category;

      container.appendChild(categoryDiv);

      habitsByCategory[category].forEach(habit => {

        const habitDiv = document.createElement('div');
        habitDiv.className = 'habit-option';

        habitDiv.innerHTML = `
          <div style="display:flex; justify-content:space-between;">
            <div>
              <strong>${habit.name}</strong>
              <span class="small">
                ${habit.default_quantity 
                  ? ` — ${habit.default_quantity} ${habit.unit || ''}` 
                  : ''}
              </span>
            </div>

            <div class="small">
              ${formatStats({
                I: habit.i,
                S: habit.s,
                W: habit.w,
                E: habit.e,
                C: habit.c,
                H: habit.h,
                ST: habit.st,
                $: habit.money
              })}
            </div>
          </div>
        `;

        habitDiv.onclick = function () {
          addHabitFromCatalog(habit);
          hideModal('habitCatalogModal');
        };

        container.appendChild(habitDiv);
      });

    });
}

function filterHabits() { const search = document.getElementById('habitSearch').value.toLowerCase(); const options = document.querySelectorAll('.habit-option'); options.forEach(option => { const text = option.textContent.toLowerCase(); option.style.display = text.includes(search) ? '' : 'none'; }); const categories = document.querySelectorAll('.category-header'); categories.forEach(category => { const nextElements = []; let next = category.nextElementSibling; while (next && next.classList.contains('habit-option')) { nextElements.push(next); next = next.nextElementSibling; } const hasVisible = nextElements.some(el => el.style.display !== 'none'); category.style.display = hasVisible ? '' : 'none'; }); }

function normalize(str){ return (str||'').toString().trim().toLowerCase(); }
function escapeRegExp(string) { return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function prettifyTopic(s){ if(!s) return ''; let r = String(s).trim(); r = r.replace(/^!+/, ''); r = r.replace(/\.[^/.]+$/, ''); try{ r = decodeURIComponent(r); }catch(e){} r = r.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(); return r; }

function findCatalogHabitByItem(item){ if(!item) return null; if(item.catalogId){ const byId = habitsCatalog.find(h => String(h.id) === String(item.catalogId)); if(byId) return byId; } let found = habitsCatalog.find(h => normalize(h.name) === normalize(item.name) && normalize(h.category) === normalize(item.category)); if(found) return found; found = habitsCatalog.find(h => normalize(h.name) === normalize(item.name)); return found || null; }

function addHabitFromCatalog(habit) {
  if (!tasksInput) return; const sign = '+'; const quantity = habit.default_quantity ? ` — ${habit.default_quantity} ${habit.unit || ''}` : ''; const stats = formatStats({ I: habit.i, S: habit.s, W: habit.w, E: habit.e, C: habit.c, H: habit.h, ST: habit.st, $: habit.money }); const habitLine = `${sign} ${habit.name}${quantity} ${stats}`; const cat = (habit.category || '').trim(); const raw = tasksInput.value || ''; const lines = raw.split('\n'); let insertIndex = -1; for (let i = 0; i < lines.length; i++) { if (lines[i].trim() === cat) { if (i + 1 < lines.length && /^—+$/.test(lines[i + 1].trim())) { insertIndex = i + 2; } else { insertIndex = i + 1; } break; } } if (insertIndex === -1) { let newText = raw.trimEnd(); if (newText.length) newText += '\n'; newText += `${cat}\n———————————————\n${habitLine}\n`; tasksInput.value = newText; } else { lines.splice(insertIndex, 0, habitLine); tasksInput.value = lines.join('\n'); } parsed = parseTextToStructure(tasksInput.value); parsed.forEach(p => { if (p.type === 'habit' && normalize(p.name) === normalize(habit.name)) { if (!p.category || normalize(p.category) === normalize(habit.category)) { p.category = habit.category; p.catalogId = habit.id; } } if (p.type === 'composite_habit') { p.subtasks.forEach(st => { if (normalize(st.name) === normalize(habit.name)) { if (!st.category || normalize(st.category) === normalize(habit.category)) { st.category = habit.category; st.catalogId = habit.id; } } }); } }); renderTasks(); renderMeta(); saveStateToLocal(); }

function showModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.style.display = 'flex'; }
function hideModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.style.display = 'none'; }

function parseTextToStructure(text){ const lines = text.replace(/\r/g,'').split('\n'); const out = []; let currentComposite = null; let currentCategory = null; for(let i = 0; i < lines.length; i++){ const raw = lines[i]; const trimmed = raw.trim(); if(!trimmed){ out.push({ type:'blank' }); continue; } if(/^—+$/.test(trimmed)){ continue; } if(!/^[*+-]/.test(trimmed) && !trimmed.endsWith(':')){ currentCategory = trimmed; out.push({ type: 'category', text: trimmed, rawText: raw }); currentComposite = null; continue; } if(/^\*.*:$/.test(trimmed)){ const name = trimmed.slice(1).trim().replace(/:$/, ''); currentComposite = { type: 'composite_habit', text: name, subtasks: [], category: currentCategory, rawText: raw }; out.push(currentComposite); continue; } if(/^[+-]/.test(trimmed)){ const sign = trimmed[0]; const success = sign === '+'; const rest = trimmed.slice(1).trim(); const match = rest.match(/^(.+?)\s*—\s*(.+?)\s*([ISWEHC]|ST|\$)\[/); let name = rest; let quantity = null; let unit = null; let statsText = ''; if(match){ name = match[1].trim(); const afterDash = match[2]; const statStart = afterDash.lastIndexOf(' I[') || afterDash.lastIndexOf(' S[') || afterDash.lastIndexOf(' W[') || afterDash.lastIndexOf(' E[') || afterDash.lastIndexOf(' C[') || afterDash.lastIndexOf(' H[') || afterDash.lastIndexOf(' ST[') || afterDash.lastIndexOf(' $['); if(statStart !== -1){ const qtyUnit = afterDash.slice(0, statStart).trim(); statsText = afterDash.slice(statStart); const qtyMatch = qtyUnit.match(/^(\d+(?:\.\d+)?)\s*(.*)$/); if(qtyMatch){ quantity = parseFloat(qtyMatch[1]); unit = qtyMatch[2].trim() || null; } } else { statsText = afterDash; } } else { const statStart = rest.lastIndexOf(' I[') || rest.lastIndexOf(' S[') || rest.lastIndexOf(' W[') || rest.lastIndexOf(' E[') || rest.lastIndexOf(' C[') || rest.lastIndexOf(' H[') || rest.lastIndexOf(' ST[') || rest.lastIndexOf(' $['); if(statStart !== -1){ name = rest.slice(0, statStart).trim(); statsText = rest.slice(statStart); } } const stats = parseCharacteristics(statsText); const habit = { type: 'habit', name: name, success: success, quantity: quantity, unit: unit, stats: stats, category: currentCategory, isSubtask: !!currentComposite, rawText: raw }; if(currentComposite){ currentComposite.subtasks.push(habit); } else { out.push(habit); currentComposite = null; } continue; } } return out; }

function showEditHabitModal(idx) {
  const item = parsed[idx];
  if(!item) return;
  document.getElementById('editIndex').value = idx;
  document.getElementById('editName').value = item.name || '';
  document.getElementById('editCategory').value = item.category || '';
  document.getElementById('editQuantity').value = item.quantity || '';
  document.getElementById('editUnit').value = item.unit || '';
  document.getElementById('editSuccess').value = item.success ? '1' : '0';
  showModal('habitEditModal');
}

document.getElementById('saveEditBtn')?.addEventListener('click', () => {
  const idx = parseInt(document.getElementById('editIndex').value, 10);
  const item = parsed[idx];
  if(!item) return hideModal('habitEditModal');

  item.name = document.getElementById('editName').value.trim();
  item.category = document.getElementById('editCategory').value.trim();
  const q = document.getElementById('editQuantity').value.trim();
  item.quantity = q ? parseFloat(q) : null;
  item.unit = document.getElementById('editUnit').value.trim();
  item.success = document.getElementById('editSuccess').value === '1';

  // Если нужно — обновляем справочник (если у этой привычки есть catalogHabit)
  const catalogHabit = habitsCatalog.find(h => (h.name||'').trim().toLowerCase() === item.name.trim().toLowerCase());
  if (catalogHabit) {
    // Пример: обновить только если хотите сохранить в БД
    // fetch(`/api/habits/${catalogHabit.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: item.name, category: item.category }) })
    //   .then(()=>{/* reload catalog if надо */});
  }

  hideModal('habitEditModal');
  renderTasks();
  renderMeta();
  saveStateToLocal();
});


const frictionInput = document.getElementById('frictionIndex');
const frictionValue = document.getElementById('frictionValue');

if (frictionInput && frictionValue) {
    frictionInput.addEventListener('input', () => {
        frictionValue.textContent = frictionInput.value;
      saveStateToLocal();
    });
}
  
  // --- renderTasks: более аккуратно определяем catalogHabit, проставляем catalogId, корректно показываем стрики ---
  function renderTasks(){
    const tasksListEl = document.getElementById('tasksList');
    if (!tasksListEl) return;
    tasksListEl.innerHTML = '';
    let currentCategory = null;

    parsed.forEach((item, idx) => {
      if(item.type === 'blank'){
        const br = document.createElement('div');
        br.style.height = '8px';
        tasksListEl.appendChild(br);
        return;
      }

      if(item.type === 'category'){
        currentCategory = prettifyTopic(item.text);
        const s = document.createElement('div');
        s.className = 'section';
        const h = document.createElement('h3');
        h.textContent = prettifyTopic(item.text || item.text);
        s.appendChild(h);
        tasksListEl.appendChild(s);
        return;
      }

      if(item.type === 'habit'){
        // Попробуем определить запись из справочника
        let catalogHabit = findCatalogHabitByItem(item);
        if (!catalogHabit && currentCategory) {
          // пробуем по текущей категории + имени
          catalogHabit = habitsCatalog.find(h => normalize(h.name) === normalize(item.name) && normalize(h.category) === normalize(currentCategory));
        }
        if (catalogHabit) {
          item.catalogId = catalogHabit.id; // сохраняем ссылку для дальнейших действий
        }

        const el = document.createElement('div');
        el.className = 'task';
        if (catalogHabit) el.classList.add('habit-from-db');
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.gap = '8px';
        el.style.padding = '8px';
        el.style.border = '1px solid #eee';
        el.style.borderRadius = '6px';
        el.style.margin = '4px 0';

        const btn = document.createElement('button');
        btn.className = 'toggle';
        btn.textContent = item.success ? '[+]' : '[-]';
        btn.onclick = () => {
          item.success = !item.success;
          btn.textContent = item.success ? '[+]' : '[-]';
          renderMeta();
          updateReportOutput();
          saveStateToLocal();
        };

        const textContainer = document.createElement('div');
        textContainer.style.flex = '1';
        textContainer.style.display = 'flex';
        textContainer.style.alignItems = 'center';
        textContainer.style.justifyContent = 'space-between';

        const mainText = document.createElement('div');
        let nameText = item.name || '';
        if(item.quantity){
          nameText += ` — ${item.quantity} ${item.unit || ''}`;
        }

          // ...
          let streakHtml = '';
          if (catalogHabit) {
            const key = String(catalogHabit.id);
            const s = streaksData && streaksData[key];
            if (s) {
              // показываем 0 также — визуально это будет 🔥0
              streakHtml = `<span class="streak-fire" title="Стрик: ${s.current} дней (рекорд: ${s.longest})">🔥${s.current}</span>`;
            }
          }
          // ...


        mainText.innerHTML = `${nameText} ${streakHtml}`;

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'habit-controls';

        if (catalogHabit) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'small';
    removeBtn.textContent = '×';
    removeBtn.title = 'Удалить из списка';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removeHabitFromText(item.name, currentCategory);
    };
    controlsDiv.appendChild(removeBtn);

    const deleteDbBtn = document.createElement('button');
    deleteDbBtn.className = 'small';
    deleteDbBtn.textContent = '🗑';
    deleteDbBtn.title = 'Удалить привычку из справочника (БД)';
    deleteDbBtn.onclick = async (e) => {
      e.stopPropagation();
      if(!confirm('Удалить эту привычку из справочника? Это действие необратимо.')) return;
      try{
      const resp = await fetch(`/api/habits/${catalogHabit.id}`, { method:'DELETE' });
      const data = await resp.json();
      if(data.status === 'success'){
        alert('Привычка удалена из справочника');
        await loadHabitsCatalog();
        parsed = parseTextToStructure(tasksInput.value);
        renderTasks(); renderMeta(); updateReportOutput();
      } else {
        alert('Ошибка удаления: ' + (data.message || ''));
      }
      }catch(err){ console.warn(err); alert('Ошибка удаления'); }
    };
    controlsDiv.appendChild(deleteDbBtn);
        } else {
          const addToCatalogBtn = document.createElement('button');
          addToCatalogBtn.className = 'small';
          addToCatalogBtn.textContent = '+ в БД';
          addToCatalogBtn.title = 'Добавить в справочник';
          addToCatalogBtn.onclick = (e) => {
            e.stopPropagation();
            addHabitToCatalog(item, currentCategory);
          };
          controlsDiv.appendChild(addToCatalogBtn);
        }

        const editBtn = document.createElement('button');
        editBtn.className = 'small';
        editBtn.textContent = '✎';
        editBtn.title = 'Редактировать';
        editBtn.onclick = (e) => { e.stopPropagation(); showEditHabitModal(idx); };
        controlsDiv.appendChild(editBtn);

        textContainer.appendChild(mainText);
        textContainer.appendChild(controlsDiv);

        el.appendChild(btn);
        el.appendChild(textContainer);
        tasksListEl.appendChild(el);
      }

      if(item.type === 'composite_habit'){
        // отрисовать заголовок составной привычки и подзадачи
        const compHeader = document.createElement('div');
        compHeader.className = 'section';
        compHeader.innerHTML = `<strong>🧩 ${prettifyTopic(item.text)}</strong>`;
        tasksListEl.appendChild(compHeader);

        item.subtasks.forEach((st, si) => {
          // используем ту же логику что и для простых привычек (если нужно, можно вынести)
          const fakeIdx = `${idx}-sub-${si}`;
          // простая карточка
          const el = document.createElement('div');
          el.className = 'task';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.gap = '8px';
          el.style.padding = '6px 8px';
          el.style.border = '1px solid #eee';
          el.style.borderRadius = '6px';
          el.style.margin = '4px 0';

          const btn = document.createElement('button');
          btn.className = 'toggle';
          btn.textContent = st.success ? '[+]' : '[-]';
          btn.onclick = () => {
            st.success = !st.success;
            btn.textContent = st.success ? '[+]' : '[-]';
            renderMeta();
            updateReportOutput();
            saveStateToLocal();
          };

          const mainText = document.createElement('div');
          let nameText = st.name || '';
          if (st.quantity) nameText += ` — ${st.quantity} ${st.unit || ''}`;

          // если есть привязка к БД
          const catalogHabit = findCatalogHabitByItem(st);
          if (catalogHabit) {
            st.catalogId = catalogHabit.id;
            const key = String(catalogHabit.id);
            if (streaksData && streaksData[key] && streaksData[key].current > 0) {
              nameText += ` <span class="streak-fire" title="Стрик: ${streaksData[key].current} дней">🔥${streaksData[key].current}</span>`;
            }
          }

          mainText.innerHTML = nameText;

          const controlsDiv = document.createElement('div');
          controlsDiv.className = 'habit-controls';

          if (catalogHabit) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'small';
            removeBtn.textContent = '×';
            removeBtn.title = 'Удалить';
      removeBtn.onclick = (e) => { e.stopPropagation(); removeHabitFromText(st.name, currentCategory); };
      controlsDiv.appendChild(removeBtn);

      const deleteDbBtn = document.createElement('button');
      deleteDbBtn.className = 'small';
      deleteDbBtn.textContent = '🗑';
      deleteDbBtn.title = 'Удалить привычку из справочника (БД)';
      deleteDbBtn.onclick = async (e) => {
       e.stopPropagation();
       if(!confirm('Удалить эту привычку из справочника?')) return;
       try{
         const resp = await fetch(`/api/habits/${catalogHabit.id}`, { method:'DELETE' });
         const data = await resp.json();
         if(data.status === 'success'){
           alert('Привычка удалена из справочника');
           await loadHabitsCatalog();
           parsed = parseTextToStructure(tasksInput.value);
           renderTasks(); renderMeta(); updateReportOutput();
         } else alert('Ошибка: ' + (data.message||''));
       }catch(err){ console.warn(err); alert('Ошибка удаления'); }
      };
      controlsDiv.appendChild(deleteDbBtn);
          } else {
            const addBtn = document.createElement('button');
            addBtn.className = 'small';
            addBtn.textContent = '+ в БД';
            addBtn.onclick = (e) => { e.stopPropagation(); addHabitToCatalog(st, currentCategory); };
            controlsDiv.appendChild(addBtn);
          }

          el.appendChild(btn);
          el.appendChild(mainText);
          el.appendChild(controlsDiv);
          tasksListEl.appendChild(el);
        });
      }
    });
  }
   // --- saveEditBtn: при редактировании отправляем обновление в БД, если есть catalogId ---
  document.getElementById('saveEditBtn')?.addEventListener('click', () => {
    const idx = parseInt(document.getElementById('editIndex').value, 10);
    const item = parsed[idx];
    if(!item) return hideModal('habitEditModal');

    item.name = document.getElementById('editName').value.trim();
    item.category = document.getElementById('editCategory').value.trim();
    const q = document.getElementById('editQuantity').value.trim();
    item.quantity = q ? parseFloat(q) : null;
    item.unit = document.getElementById('editUnit').value.trim();
    item.success = document.getElementById('editSuccess').value === '1';

    // если связана запись в справочнике — обновляем её на сервере
    const catalogHabit = findCatalogHabitByItem(item);
    if (catalogHabit) {
      const habitUpdate = {
        name: item.name,
        category: item.category || catalogHabit.category,
        default_quantity: item.quantity || catalogHabit.default_quantity || null,
        unit: item.unit || catalogHabit.unit || null
      };
      fetch(`/api/habits/${catalogHabit.id}`, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(habitUpdate)
      })
      .then(r => r.json())
      .then(data => {
        if (data.status === 'success') {
          // перезагрузим справочник, чтобы синхронизировать id/категории/статистику
          loadHabitsCatalog();
        } else {
          console.warn('Не удалось обновить привычку в БД:', data);
        }
      })
      .catch(err => console.warn('Ошибка обновления привычки:', err));
    }

    hideModal('habitEditModal');
    renderTasks();
    renderMeta();
    saveStateToLocal();
  });   
  
  function removeHabitFromText(habitName, category) {
    if (!tasksInput) return;
    const nameEsc = escapeRegExp((habitName||'').trim());
    const catEsc = category ? escapeRegExp((category||'').trim()) : null;
    const lines = tasksInput.value.split('\n').filter(line => {
      const trimmed = line.trim();
      // only remove lines that start with + or - and contain the exact habit name at start
      if(!/^[+-]/.test(trimmed)) return true;
      // match + HabitName or - HabitName (optionally followed by ' —' or stats)
      const re = new RegExp('^[+-]\\s*' + nameEsc + '(?:\\s|\\s—|\\s—|$)', 'i');
      if(re.test(trimmed)) return false;
      return true;
    });
    tasksInput.value = lines.join('\n');
    parsed = parseTextToStructure(tasksInput.value);
    renderTasks();
    renderMeta();
  }
  
  function addHabitToCatalog(habit, category) {
    // Используем категорию из параметра функции
    const habitData = {
      name: habit.name,
      category: category || 'Без категории',  // Исправлено: берем категорию из параметра
      default_quantity: habit.quantity || null,
      unit: habit.unit || null,
      i: habit.stats.I,
      s: habit.stats.S,
      w: habit.stats.W,
      e: habit.stats.E,
      c: habit.stats.C,
      h: habit.stats.H,
      st: habit.stats.ST,
      money: habit.stats.$
    };
    
    fetch('/api/habits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(habitData)
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        alert('Привычка добавлена в справочник!');
        loadHabitsCatalog();
      } else {
        alert('Ошибка: ' + data.message);
      }
    })
    .catch(error => {
      console.error('Ошибка:', error);
      alert('Ошибка добавления');
    });
  }
  
  function renderMeta(){
    if (!todayDisplay || !currentDayDisplay || !diffDaysEl || !completedCountEl || !totalCountEl || !percentDoneEl || !stateDesc) return;

    // system date shown separately; calculations use selected report date when available
    const systemToday = new Date();
    todayDisplay.textContent = toISODate(systemToday);

    const reportDateEl = document.getElementById('reportDate');
    const reportDateVal = reportDateEl && reportDateEl.value ? new Date(reportDateEl.value) : new Date();

    const lastDateVal = lastDateEl.value ? new Date(lastDateEl.value) : null;
    const lastDayVal = Number(lastDayEl.value || 0);
    if(lastDateVal){
      const diff = daysBetween(lastDateVal, reportDateVal);
      diffDaysEl.textContent = diff;
      currentDayDisplay.textContent = String(lastDayVal + diff);
    } else {
      diffDaysEl.textContent = '—';
      currentDayDisplay.textContent = String(lastDayVal || 0);
    }
    
    const total = parsed.filter(p => p.type === 'habit').length + 
                 parsed.filter(p => p.type === 'composite_habit').reduce((sum, c) => sum + c.subtasks.length, 0);
    const completed = parsed.filter(p => p.type === 'habit' && p.success).length +
                     parsed.filter(p => p.type === 'composite_habit').reduce((sum, c) => sum + c.subtasks.filter(s => s.success).length, 0);
    
    totalCountEl.textContent = total;
    completedCountEl.textContent = completed;
    const pct = total === 0 ? 0 : Math.round((completed/total)*100);
    percentDoneEl.textContent = pct + '%';
    stateDesc.textContent = STATE_DESCRIPTIONS[stateSelect.value] || '';
    
    const totals = calculateTotalStats(parsed);
    renderTotalStats(totals);
  }
  // в конце renderMeta()
  try { loadDailyComparison(); } catch(e) { console.warn('compare load failed', e); }


function computeCompletionStats(parsed) {
  let total = 0;
  let completed = 0;

  parsed.forEach(item => {
    // Обычная привычка
    if (item.type === 'habit' || item.type === 'simple_habit') {
      total += 1;
      if (item.success) completed += 1;
      return;
    }

    // Комбинированная привычка — ожидаем item.subtasks = [{ success: bool, ... }, ...]
    if (item.type === 'composite_habit' || item.type === 'habit_group' || Array.isArray(item.subtasks)) {
      if (Array.isArray(item.subtasks) && item.subtasks.length) {
        item.subtasks.forEach(st => {
          total += 1;
          if (st.success) completed += 1;
        });
      } else {
        // Если subtasks не указаны, считаем сам composite как одна привычка
        total += 1;
        if (item.success) completed += 1;
      }
      return;
    }

    // На всякий случай: если встречается элемент со свойством success и catalogId — считаем его
    if ('success' in item) {
      total += 1;
      if (item.success) completed += 1;
    }
  });

  const notCompleted = total - completed;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 10000) / 100; // два знака после запятой

  return { total, completed, notCompleted, percent };
}


  function buildReportText(){
  // Use selected report date for generated report (fallback to today)
  const reportDateEl = document.getElementById('reportDate');
  const reportDate = reportDateEl && reportDateEl.value ? new Date(reportDateEl.value) : new Date();
  const todayISO = toISODate(reportDate);
  const lastDateVal = lastDateEl.value ? new Date(lastDateEl.value) : null;
  const lastDayVal = Number(lastDayEl.value || 0);
  let dayNumber = lastDayVal;
  if(lastDateVal) dayNumber = lastDayVal + daysBetween(lastDateVal, reportDate);

    const totals = calculateTotalStats(parsed);

    const lines = [];
    lines.push(`📅 ДЕНЬ ${dayNumber} · ${todayISO}`);
    lines.push(`🧭 STATE: ${stateSelect ? stateSelect.value : 'WORK'}`);
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━');
    lines.push('📊 СУММА ХАРАКТЕРИСТИК (за день)');
    lines.push('━━━━━━━━━━━━━━━━━━');

  if (appliedCombos && appliedCombos.length) {
    lines.push('');
    lines.push('🔗 Сочетания (применены бонусы):');
    appliedCombos.forEach(c => {
      const name = c.name || `${c.name_a || ''} + ${c.name_b || ''}`;
      const parts = [];
      if (Number(c.i)) parts.push(`I:${Number(c.i).toFixed(2)}`);
      if (Number(c.s)) parts.push(`S:${Number(c.s).toFixed(2)}`);
      if (Number(c.w)) parts.push(`W:${Number(c.w).toFixed(2)}`);
      if (Number(c.e)) parts.push(`E:${Number(c.e).toFixed(2)}`);
      if (Number(c.c)) parts.push(`C:${Number(c.c).toFixed(2)}`);
      if (Number(c.h)) parts.push(`H:${Number(c.h).toFixed(2)}`);
      if (Number(c.st)) parts.push(`ST:${Number(c.st)}`);
      if (Number(c.money)) parts.push(`$:${Number(c.money)}`);
      lines.push(`• ${name} — ${parts.join(' ')}`);
    });
    lines.push('━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

    // Форматируем только ненулевые значения для текущего дня
    const todaysFormatted = formatTotalsForReport(totals);
    lines.push(todaysFormatted);

    // Добавляем сравнение (стрелочки) если есть
    if (dailyComparison) {
      const comps = [];
      const map = { I: 'I', S: 'S', W: 'W', E: 'E', C: 'C', H: 'H', ST: 'ST', $: '$' };
      Object.keys(map).forEach(key => {
        if (dailyComparison[key]) comps.push(`${key}${dailyComparison[key]}`);
      });
      if (comps.length) lines.push(`Сравнение: ${comps.join(' ')}`);
    }

    // Добавляем сумму за всё время, если доступна
    if (allTimeTotals) {
      lines.push('');
      lines.push('━━━━━━━━━━━━━━━━━━');
      lines.push('📊 СУММА ХАРАКТЕРИСТИК (всё время)');
      lines.push('━━━━━━━━━━━━━━━━━━');
      lines.push(formatTotalsForReport(allTimeTotals));
    }

    lines.push('');
    lines.push('━━━━━━━━━━');
    lines.push('🧠 СОСТОЯНИЕ');
    lines.push('━━━━━━━━━━');
    lines.push(`🌅 Утро: ${emotionMorning || '—'}`);
    lines.push('');

    let currentCategory = null;

    parsed.forEach(item => {
      if(item.type === 'category'){
        lines.push('');
        lines.push('━━━━━━━━━━');
  lines.push(prettifyTopic(item.text));
        lines.push('━━━━━━━━━━');
        currentCategory = prettifyTopic(item.text);
      }

      if(item.type === 'habit' && !item.isSubtask){
        const icon = item.success ? '✅' : '❌';
        let line = `${icon} ${item.name}`;
        if(item.quantity){
          line += ` — ${item.quantity} ${item.unit || ''}`;
        }
        // добавляем стрик, если есть связанная запись в справочнике и стрик доступен
        const catalogHabit = findCatalogHabitByItem(item);
        if (catalogHabit) {
          const key = String(catalogHabit.id);
          if (streaksData && streaksData[key]) {
            line += `  🔥${streaksData[key].current}`;
          }
        }
        // добавляем ненулевые характеристики
        const statsParts = [];
        ['I','S','W','E','C','H'].forEach(k => {
          if (item.stats && Number(item.stats[k]) !== 0) statsParts.push(`${k}[${Number(item.stats[k]).toFixed(2)}]`);
        });
        if (item.stats && (Number(item.stats.ST) || Number(item.stats.$))) {
    if (Number(item.stats.ST) !== 0) statsParts.push(`ST[${Number(item.stats.ST).toFixed(2)}]`);
          if (Number(item.stats.$) !== 0) statsParts.push(`$[${Number(item.stats.$)}]`);
        }
        if (statsParts.length) line += ' ' + statsParts.join(' ');
        lines.push(line);
      }

      if(item.type === 'composite_habit'){
        lines.push(`🧩 ${prettifyTopic(item.text)}:`);
        item.subtasks.forEach(subtask => {
          const icon = subtask.success ? '✅' : '❌';
          let line = `   ${icon} ${subtask.name}`;
          if(subtask.quantity){
            line += ` — ${subtask.quantity} ${subtask.unit || ''}`;
          }
          const catalogHabit = findCatalogHabitByItem(subtask);
          if (catalogHabit) {
            const key = String(catalogHabit.id);
            if (streaksData && streaksData[key]) {
              line += `  🔥${streaksData[key].current}`;
            }
          }
          const statsParts = [];
          ['I','S','W','E','C','H'].forEach(k => {
            if (subtask.stats && Number(subtask.stats[k]) !== 0) statsParts.push(`${k}[${Number(subtask.stats[k]).toFixed(2)}]`);
          });
          if (subtask.stats && (Number(subtask.stats.ST) || Number(subtask.stats.$))) {
      if (Number(subtask.stats.ST) !== 0) statsParts.push(`ST[${Number(subtask.stats.ST).toFixed(2)}]`);
            if (Number(subtask.stats.$) !== 0) statsParts.push(`$[${Number(subtask.stats.$)}]`);
          }
          if (statsParts.length) line += ' ' + statsParts.join(' ');
          lines.push(line);
        });
      }
    });

  const stats = computeCompletionStats(parsed); // parsed — ваш день/список привычек
  lines.push('');
  lines.push(`Привычек выполнено: ${stats.completed} / ${stats.total} ( ${stats.percent}% )`);

    if(dailyQuestions.length){
      lines.push('');
      lines.push('━━━━━━━━━━');
      lines.push('➕ КОНТРОЛЬ');
      lines.push('━━━━━━━━━━');
      dailyQuestions.forEach(q => {
        lines.push(`• ${q.q} → ${q.a || '—'}`);
      });
    }

    if(thoughtsInput && thoughtsInput.value && thoughtsInput.value.trim()){
      lines.push('');
      lines.push('━━━━━━━━━━');
      lines.push('✍️ МЫСЛИ');
      lines.push('━━━━━━━━━━');
      lines.push(thoughtsInput.value.trim());
    }

    return lines.join('\n');
  }

  
  function buildCSV(){
    const rows = [];
    // Use selected report date for CSV export (fallback to today)
    const reportDateEl = document.getElementById('reportDate');
    const reportDate = reportDateEl && reportDateEl.value ? new Date(reportDateEl.value) : new Date();
    const todayISO = toISODate(reportDate);
    const lastDayVal = Number(lastDayEl.value || 0);
    const dayNumber = lastDateEl.value ? lastDayVal + daysBetween(new Date(lastDateEl.value), reportDate) : lastDayVal;
    
    rows.push(['ДЕНЬ', 'Дата', 'STATE', 'Тип', 'Название', 'Количество', 'Единица', 'Успех', 'I', 'S', 'W', 'E', 'C', 'H', 'ST', '$', 'Категория']);
    
    parsed.forEach(item => {
      if(item.type === 'habit' && !item.isSubtask){
        rows.push([
          dayNumber, todayISO, stateSelect ? stateSelect.value : 'WORK', 'Привычка',
          item.name, item.quantity || '', item.unit || '',
          item.success ? 'Да' : 'Нет',
          item.stats.I, item.stats.S, item.stats.W, item.stats.E,
          item.stats.C, item.stats.H, Number(item.stats.ST).toFixed(2), item.stats.$,
          item.category || ''
        ]);
      }
      
      if(item.type === 'composite_habit'){
        rows.push([
          dayNumber, todayISO, stateSelect ? stateSelect.value : 'WORK', 'Составная привычка',
          item.text, '', '', '', '', '', '', '', '', '', '', '', item.category || ''
        ]);
        
        item.subtasks.forEach(subtask => {
          rows.push([
            dayNumber, todayISO, stateSelect ? stateSelect.value : 'WORK', 'Подзадача',
            subtask.name, subtask.quantity || '', subtask.unit || '',
            subtask.success ? 'Да' : 'Нет',
            subtask.stats.I, subtask.stats.S, subtask.stats.W, subtask.stats.E,
            subtask.stats.C, subtask.stats.H, Number(subtask.stats.ST).toFixed(2), subtask.stats.$,
            item.category || ''
          ]);
        });
      }
    });
    
    return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  }
  
  function updateReportOutput(){
    if (!reportOutput) return;
    reportOutput.textContent = buildReportText();
  }
  
  function saveStateToLocal(){
    if (!lastDayEl || !lastDateEl || !tasksInput || !stateSelect || !thoughtsInput) return;
    
    const payload = {
      lastDay: lastDayEl.value,
      lastDate: lastDateEl.value,
      reportDate: document.getElementById('reportDate') ? document.getElementById('reportDate').value : '',
      frictionIndex: document.getElementById('frictionIndex') ? document.getElementById('frictionIndex').value : '',
      inputText: tasksInput.value,
      parsed: parsed,
      state: stateSelect.value,
      thoughts: thoughtsInput.value,
      emotionMorning: emotionMorning,
      dailyQuestions: dailyQuestions
    };
    try{ 
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); 
    } catch(e){ 
      console.warn('save failed', e); 
    }
  }
  
  function loadStateFromLocal(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      const obj = JSON.parse(raw);
      
      if(lastDayEl && obj.lastDay) lastDayEl.value = obj.lastDay;
      if(lastDateEl && obj.lastDate) lastDateEl.value = obj.lastDate;
      if(document.getElementById('reportDate') && obj.reportDate) document.getElementById('reportDate').value = obj.reportDate;
      if(document.getElementById('frictionIndex') && obj.frictionIndex) {
        document.getElementById('frictionIndex').value = obj.frictionIndex;
        const fv = document.getElementById('frictionValue');
        if(fv) fv.textContent = obj.frictionIndex;
      }
      if(tasksInput && obj.inputText) tasksInput.value = obj.inputText;
      if(obj.parsed) parsed = obj.parsed;
      if(stateSelect && obj.state) stateSelect.value = obj.state;
      if(thoughtsInput && obj.thoughts) thoughtsInput.value = obj.thoughts;
      if(obj.emotionMorning) emotionMorning = obj.emotionMorning;
      if(obj.dailyQuestions) dailyQuestions = obj.dailyQuestions;
      
      return true;
    } catch(e){ 
      console.warn('load failed', e); 
      return false; 
    }
  }
  
  function renderQuestions(){
    const box = document.getElementById('questionsBox');
    if (!box) return;
    
    box.innerHTML = '';
    dailyQuestions = CONTROL_QUESTIONS
      .sort(()=>Math.random()-0.5)
      .slice(0,3)
      .map(q=>({q, a:null}));

    dailyQuestions.forEach((item,i)=>{
      const d = document.createElement('div');
      d.className = 'state-desc';
      d.innerHTML = `
        ${item.q}<br>
        <select data-i="${i}">
          <option value="">—</option>
          <option>Да</option>
          <option>Скорее да</option>
          <option>Скорее нет</option>
          <option>Нет</option>
        </select>`;
      d.querySelector('select').onchange = e=>{
        dailyQuestions[i].a = e.target.value;
        updateReportOutput();
        saveStateToLocal();
      };
      box.appendChild(d);
    });
  }
  
  function renderEmotions(containerId, setter){
    const box = document.getElementById('emotionMorning');
    if (!box) return;
    
    EMOTIONS.forEach(e=>{
      const b = document.createElement('button');
      b.textContent = e;
      b.className = 'emotion-btn';
      b.onclick = ()=>{
        setter(e);
        [...box.children].forEach(c=>c.classList.remove('active'));
        b.classList.add('active');
        updateReportOutput();
        saveStateToLocal();
      };
      box.appendChild(b);
    });
  }
  
  // Инициализация при загрузке страницы
  function init(){
    // Получаем элементы DOM
    todayDisplay = document.getElementById('todayDisplay');
    currentDayDisplay = document.getElementById('currentDayDisplay');
    diffDaysEl = document.getElementById('diffDays');
    lastDayEl = document.getElementById('lastDay');
    lastDateEl = document.getElementById('lastDate');
    tasksInput = document.getElementById('tasksInput');
    parseBtn = document.getElementById('parseBtn');
    tasksList = document.getElementById('tasksList');
    makeReportBtn = document.getElementById('makeReport');
    reportOutput = document.getElementById('reportOutput');
    copyReport = document.getElementById('copyReport');
    downloadReport = document.getElementById('downloadReport');
    saveBtn = document.getElementById('saveBtn');
    loadBtn = document.getElementById('loadBtn');
    clearBtn = document.getElementById('clearBtn');
    resetStatusesBtn = document.getElementById('resetStatuses');
    sampleBtn = document.getElementById('sampleBtn');
    completedCountEl = document.getElementById('completedCount');
    totalCountEl = document.getElementById('totalCount');
    percentDoneEl = document.getElementById('percentDone');
    stateSelect = document.getElementById('stateSelect');
    stateDesc = document.getElementById('stateDesc');
    thoughtsInput = document.getElementById('thoughtsInput');
    
    // Инициализируем интерфейс
    if (todayDisplay) {
      const today = new Date();
      todayDisplay.textContent = toISODate(today);
    }
    if (lastDateEl && !lastDateEl.value) {
      lastDateEl.value = toISODate(new Date());
    }
    const reportDateEl = document.getElementById('reportDate');
    if(reportDateEl && !reportDateEl.value) reportDateEl.value = toISODate(new Date());
    
    renderMeta();
    
    if(loadStateFromLocal()){
      renderMeta();
      renderTasks(); 
      updateReportOutput(); 
    }
    
    renderEmotions('emotionMorning', v => emotionMorning = v);
    renderQuestions();
    
    // Загрузить данные из БД
    loadHabitsCatalog();
    loadDatesFromDB();
    loadAllTimeTotals();
  loadCombinations();
    loadStreaks();
    loadPeriodStats('week');
    
    // Назначаем обработчики событий
    setupEventListeners();
  }
  
  function setupEventListeners() {
    document.getElementById('manageCombosBtn')?.addEventListener('click', openCombos);
    
    if (parseBtn) {
      parseBtn.addEventListener('click', () => {
        parsed = parseTextToStructure(tasksInput.value);
        renderMeta();
        renderTasks();
        updateReportOutput();
        saveStateToLocal();
      });
    }
    
    if (makeReportBtn) {
      makeReportBtn.addEventListener('click', () => { 
        updateReportOutput(); 
      });
    }
    
    if (copyReport) {
      copyReport.addEventListener('click', () => { 
        const text = reportOutput ? reportOutput.textContent : buildReportText();
        navigator.clipboard?.writeText(text).then(() => {
          alert('Текст скопирован в буфер');
        }).catch(() => {
          prompt('Скопируйте вручную:', text);
        });
      });
    }
    
    if (downloadReport) {
      downloadReport.addEventListener('click', () => { 
        const txt = reportOutput ? reportOutput.textContent : buildReportText();
        const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // use report date, not system date
        const reportDateEl = document.getElementById('reportDate');
        const fnDate = reportDateEl && reportDateEl.value ? reportDateEl.value : toISODate(new Date());
        a.download = `report_${fnDate}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }
    
    if (saveBtn) {
      saveBtn.addEventListener('click', () => { 
        saveStateToLocal(); 
        alert('Сохранено в localStorage.'); 
      });
    }
    // keep UI coherent when report date changes
    const reportDateEl = document.getElementById('reportDate');
    if (reportDateEl) {
      reportDateEl.addEventListener('change', () => {
        // user switched target date manually; drop any loaded DB day so slider reactivates
        currentDayFromDB = null;
        const frictionInput = document.getElementById('frictionIndex');
        if (frictionInput) frictionInput.disabled = false;
        renderMeta();
        loadDailyComparison();
        updateReportOutput();
      });
    }
    
    if (loadBtn) {
      loadBtn.addEventListener('click', () => { 
        if(loadStateFromLocal()){ 
          renderMeta(); 
          renderTasks(); 
          updateReportOutput(); 
          alert('Загружено из localStorage.'); 
        } else { 
          alert('Данных в localStorage не найдено.'); 
        }
      });
    }
    
    if (clearBtn) {
      clearBtn.addEventListener('click', () => { 
        if(confirm('Очистить форму и localStorage?')){ 
          localStorage.removeItem(STORAGE_KEY); 
          if (tasksInput) tasksInput.value = ''; 
          parsed = []; 
          if (thoughtsInput) thoughtsInput.value = ''; 
          if (stateSelect) stateSelect.value = 'WORK'; 
          emotionMorning = null;
          const frictionInput = document.getElementById('frictionIndex');
          const frictionValue = document.getElementById('frictionValue');
          if (frictionInput) { frictionInput.value = 1; frictionInput.disabled = false; }
          if (frictionValue) frictionValue.textContent = '1';
          renderMeta(); 
          renderTasks(); 
          updateReportOutput(); 
        } 
      });
    }
    
    if (resetStatusesBtn) {
      resetStatusesBtn.addEventListener('click', () => { 
        parsed.forEach(item => {
          if(item.type === 'habit') item.success = false;
          if(item.type === 'composite_habit'){
            item.subtasks.forEach(st => st.success = false);
          }
        }); 
        renderTasks(); 
        renderMeta();
        updateReportOutput(); 
        saveStateToLocal(); 
      });
    }
    
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => { 
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
        
        if (tasksInput) tasksInput.value = sampleText;
        if (thoughtsInput) thoughtsInput.value = 'Хороший продуктивный день. Удалось выполнить все основные привычки. Завтра уделить больше времени работе над проектом.';
        
        parsed = parseTextToStructure(sampleText);
        renderMeta(); 
        renderTasks(); 
        updateReportOutput(); 
        saveStateToLocal();
      });
    }
    
    if (stateSelect) {
      stateSelect.addEventListener('change', () => { 
        renderMeta(); 
        saveStateToLocal(); 
      });
    }
    
    if (thoughtsInput) {
      thoughtsInput.addEventListener('input', () => { 
        saveStateToLocal(); 
      });
    }
    
    const downloadCSVBtn = document.getElementById('downloadCSV');
    if (downloadCSVBtn) {
      downloadCSVBtn.addEventListener('click', () => {
        const csv = buildCSV();
        const csvWithBOM = '\uFEFF' + csv;
        const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `report_${toISODate(new Date())}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }
    
    const downloadPlainTXTBtn = document.getElementById('downloadPlainTXT');
    if (downloadPlainTXTBtn) {
      downloadPlainTXTBtn.addEventListener('click', () => {
        const todayISO = toISODate(new Date());
        const lines = [];
        
        const lastDayVal = Number(lastDayEl ? lastDayEl.value : 0);
        const dayNumber = lastDateEl && lastDateEl.value ? lastDayVal + daysBetween(new Date(lastDateEl.value), new Date()) : lastDayVal;
        
        lines.push(`DAY|${todayISO}|${dayNumber}|${stateSelect ? stateSelect.value : 'WORK'}`);
        
        const totals = calculateTotalStats(parsed);
        lines.push(`STATS_TOTAL|I:${totals.I}|S:${totals.S}|W:${totals.W}|E:${totals.E}|C:${totals.C}|H:${totals.H}|ST:${totals.ST}|$:${totals.$}`);
        
        parsed.forEach(item => {
          if(item.type === 'category'){
            lines.push(`CATEGORY|${prettifyTopic(item.text)}`);
          } else if(item.type === 'habit' && !item.isSubtask){
            const status = item.success ? 'DONE' : 'TODO';
            const stats = `I${item.stats.I}S${item.stats.S}W${item.stats.W}E${item.stats.E}C${item.stats.C}H${item.stats.H}ST${item.stats.ST}$${item.stats.$}`;
            lines.push(`HABIT|${status}|${item.name}|${item.quantity || ''}|${item.unit || ''}|${stats}`);
          } else if(item.type === 'composite_habit'){
            lines.push(`COMPOSITE|${prettifyTopic(item.text)}`);
            item.subtasks.forEach(st => {
              const status = st.success ? 'DONE' : 'TODO';
              const stats = `I${st.stats.I}S${st.stats.S}W${st.stats.W}E${st.stats.E}C${st.stats.C}H${st.stats.H}ST${st.stats.ST}$${st.stats.$}`;
              lines.push(`SUBTASK|${status}|${st.name}|${st.quantity || ''}|${st.unit || ''}|${stats}`);
            });
          }
        });
        
        lines.push(`EMOTION|Morning|${emotionMorning || '-'}`);
        
        dailyQuestions.forEach(q => {
          lines.push(`QUESTION|${q.q}|${q.a || '-'}`);
        });
        
        if(thoughtsInput && thoughtsInput.value && thoughtsInput.value.trim()){
          lines.push(`THOUGHT|${thoughtsInput.value.trim().replace(/\n/g, ' ')}`);
        }
        
        const txt = lines.join('\n');
        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${todayISO}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    }
    
    if (lastDateEl) {
      lastDateEl.addEventListener('change', () => { 
        renderMeta(); 
        saveStateToLocal(); 
      });
    }
    
    if (lastDayEl) {
      lastDayEl.addEventListener('change', () => { 
        renderMeta(); 
        saveStateToLocal(); 
      });
    }
    
    const loadFromDBBtn = document.getElementById('loadFromDBBtn');
    if (loadFromDBBtn) {
      loadFromDBBtn.addEventListener('click', () => {
        const dbDateSelect = document.getElementById('dbDateSelect');
        if (dbDateSelect) {
          dbDateSelect.value = toISODate(new Date());
          loadDayFromDB();
        }
      });
    }
    
    const saveToDBBtn = document.getElementById('saveToDBBtn');
    if (saveToDBBtn) {
      saveToDBBtn.addEventListener('click', saveDayToDB);
    }

    const changeDateBtn = document.getElementById('changeDateBtn');
    if (changeDateBtn) {
      changeDateBtn.addEventListener('click', async ()=>{
        const oldDate = document.getElementById('dbDateSelect')?.value;
        const newDate = document.getElementById('changeDateInput')?.value;
        if(!oldDate || !newDate){ alert('Выберите дату из БД и укажите новую дату'); return; }
        const resp = await fetch('/api/completions/change_date', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ old_date: oldDate, new_date: newDate }) });
        const data = await resp.json();
        if(data.status === 'success'){
          alert('День перенесён');
          // reload available dates and set selection
          await loadDatesFromDB();
          const sel = document.getElementById('dbDateSelect'); if(sel) sel.value = newDate;
          loadDayFromDB();
        } else alert('Ошибка: '+(data.message||''));
      });
    }
    
    const addFromCatalogBtn = document.getElementById('addFromCatalogBtn');
    if (addFromCatalogBtn) {
      addFromCatalogBtn.addEventListener('click', () => {
        showModal('habitCatalogModal');
      });
    }
  }
  
  // Запуск инициализации после загрузки страницы
  init();