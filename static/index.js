// Replace the entire index.js content with the following:

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

function humanPercent(x) {
  return Number.isFinite(x) ? `${x.toFixed(1)}%` : '—';
}

let currentPeriodData = null;
let currentChartPeriod = 'week';
let charChart, stChart;

function initCharts() {
  const ctxChar = document.getElementById('charChart').getContext('2d');
  const ctxSt = document.getElementById('stChart').getContext('2d');
  charChart = new Chart(ctxChar, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
  });
  stChart = new Chart(ctxSt, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: { responsive: true, maintainAspectRatio: true }
  });
}

function renderCharts(daysData) {
  if (!daysData || daysData.length === 0) {
    charChart.data = { labels: [], datasets: [] };
    stChart.data = { labels: [], datasets: [] };
    charChart.update();
    stChart.update();
    return;
  }

  const labels = daysData.map(d => d.date);
  const datasetsChar = [
    { label: 'I', data: daysData.map(d => d.I || 0), borderColor: '#e74c3c', fill: false },
    { label: 'S', data: daysData.map(d => d.S || 0), borderColor: '#f39c12', fill: false },
    { label: 'W', data: daysData.map(d => d.W || 0), borderColor: '#2ecc71', fill: false },
    { label: 'E', data: daysData.map(d => d.E || 0), borderColor: '#3498db', fill: false },
    { label: 'C', data: daysData.map(d => d.C || 0), borderColor: '#9b59b6', fill: false },
    { label: 'H', data: daysData.map(d => d.H || 0), borderColor: '#1abc9c', fill: false }
  ];
  charChart.data = { labels, datasets: datasetsChar };
  charChart.update();

  const stData = daysData.map(d => d.ST || 0);
  stChart.data = { labels, datasets: [{ label: 'ST', data: stData, borderColor: '#4a90e2', fill: false }] };
  stChart.update();
}

async function loadPeriodForCharts(period) {
  try {
    const data = await fetchJson(`/api/stats/period?period=${period}`);
    if (data.status === 'success') {
      renderCharts(data.days_data || []);
    }
  } catch (e) {
    console.error('loadPeriodForCharts error', e);
  }
}

let allTimeStats = null;

async function loadAllTimeStats() {
  try {
    const data = await fetchJson('/api/stats/period?period=all');
    if (data.status === 'success') {
      allTimeStats = data.stats;
      document.getElementById('totalDaysValue').textContent = data.stats.days_count || 0;
      updateDisciplineCounter(data.stats.days_count);
    }
  } catch (e) {
    console.error('loadAllTimeStats error', e);
  }
}

async function loadStreaks() {
  try {
    const streaksData = await fetchJson('/api/stats/streaks');
    if (streaksData.status !== 'success') return;
    const streaks = Object.values(streaksData.streaks || {});
    let current = 0, best = 0;
    for (const s of streaks) {
      current = Math.max(current, s.current_streak || 0);
      best = Math.max(best, s.max_streak || 0);
    }
    document.getElementById('currentStreakValue').textContent = `${current} 🧨`;
    document.getElementById('bestStreakValue').textContent = `${best} 🔥`;
    updateDisciplineCounter(allTimeStats?.days_count);
  } catch (e) {
    console.error('loadStreaks error', e);
  }
}

function updateDisciplineCounter(totalDays) {
  const currentStreakText = document.getElementById('currentStreakValue').textContent;
  const currentStreak = parseInt(currentStreakText.split(' ')[0]) || 0;
  const disciplineValue = (totalDays || 0) + currentStreak;

  const currentMilestone = Math.floor(disciplineValue / 100) * 100 + 100;
  const progressInStage = disciplineValue % 100;
  const progressPercent = (progressInStage / 100) * 100;

  document.getElementById('disciplineCounterValue').textContent = `${disciplineValue} 💪`;
  document.getElementById('disciplineProgressFill').style.width = `${progressPercent}%`;
  document.getElementById('disciplineProgressText').textContent = `${disciplineValue}/${currentMilestone} дней`;
  if (disciplineValue >= currentMilestone) {
    document.getElementById('disciplineProgressText').textContent += ' — Поздравляю! Достигнуто!';
  }
}

async function loadAvgST(period = 'week') {
  try {
    const data = await fetchJson(`/api/stats/period?period=${period}`);
    if (data.status === 'success') {
      const avgST = data.stats.avg_st || 0;
      document.getElementById('avgSTValue').textContent = avgST.toFixed(2);
    }
  } catch (e) {
    console.error('loadAvgST error', e);
  }
}

async function loadMLPrediction() {
  try {
    // Используем данные за неделю для простого прогноза по тренду
    const weekData = await fetchJson('/api/stats/period?period=week');
    if (weekData.status === 'success' && weekData.days_data && weekData.days_data.length > 0) {
      const stValues = weekData.days_data.map(d => d.ST || 0);
      const currentST = stValues[stValues.length-1];
      let predicted = currentST;
      if (stValues.length > 1) {
        const trend = currentST - stValues[stValues.length-2];
        predicted = currentST + trend;
      }
      document.getElementById('predictionValue').textContent = `${currentST.toFixed(2)} → ${predicted.toFixed(2)} (тренд)`;
    } else {
      document.getElementById('predictionValue').textContent = 'Недостаточно данных';
    }
  } catch (e) {
    console.warn('Could not load prediction', e);
    document.getElementById('predictionValue').textContent = 'Ошибка прогноза';
  }
}

async function loadDailyComparison() {
  try {
    const now = new Date().toISOString().slice(0, 10);
    const cmp = await fetchJson(`/api/stats/daily_comparison?date=${now}`);
    if (cmp.status !== 'success') return;
    const root = document.getElementById('dailyComparison');
    root.innerHTML = '';
    if (!cmp.comparison || Object.keys(cmp.comparison).length === 0) {
      root.textContent = 'Нет данных для сравнения.';
      return;
    }
    Object.entries(cmp.comparison).forEach(([key, symbol]) => {
      const item = document.createElement('article');
      item.className = 'stat-item';
      item.innerHTML = `<strong>${key}</strong><span>${symbol}</span>`;
      root.appendChild(item);
    });
  } catch (e) {
    console.error('loadDailyComparison error', e);
  }
}

async function loadRecommendations() {
  try {
    const weekData = await fetchJson('/api/stats/period?period=week');
    const monthData = await fetchJson('/api/stats/period?period=month');
    if (weekData.status !== 'success' || monthData.status !== 'success') {
      document.getElementById('recommendationsList').innerHTML = 'Недостаточно данных для рекомендаций.';
      return;
    }
    const weekAvg = weekData.stats;
    const monthAvg = monthData.stats;
    const daysData = weekData.days_data || [];
    const stValues = daysData.map(d => d.ST || 0);
    const trend = stValues.length > 1 ? stValues[stValues.length-1] - stValues[stValues.length-2] : 0;

    const recs = [];

    if (weekAvg.avg_st < 0.5) recs.push('➕ ST ниже среднего. Попробуй добавить интеллектуальные привычки (чтение, обучение).');
    else if (weekAvg.avg_st > 2) recs.push('🔥 Отличный уровень ST! Продолжай в том же духе.');
    if (weekAvg.avg_i < 0.2) recs.push('📉 Низкий I (интеллект). Возможно, стоит включить задачи на развитие логики.');
    if (weekAvg.avg_h < 0.3) recs.push('❤️ Здоровье в минусе. Проверь сон, питание, активность.');
    if (trend < -0.1) recs.push('📉 Тренд ST падает. Обрати внимание на самые эффективные привычки.');
    if (trend > 0.2) recs.push('📈 Хороший рост! Закрепляй успех, не снижай темп.');

    if (recs.length === 0) recs.push('Пока всё стабильно. Держи дисциплину!');

    document.getElementById('recommendationsList').innerHTML = recs.map(r => `• ${r}`).join('<br>');
  } catch (e) {
    console.error('loadRecommendations error', e);
    document.getElementById('recommendationsList').innerHTML = 'Не удалось сформировать рекомендации.';
  }
}

let allIdeas = [];

async function loadRandomIdea() {
  try {
    const resp = await fetchJson('/api/ideas');
    if (resp.status === 'success') {
      allIdeas = resp.data.filter(i => !i.is_completed);
      if (allIdeas.length === 0) {
        document.getElementById('randomIdeaContent').innerHTML = 'Нет нереализованных идей. Добавьте новую!';
        return;
      }
      const randomIndex = Math.floor(Math.random() * allIdeas.length);
      const idea = allIdeas[randomIndex];
      document.getElementById('randomIdeaContent').innerHTML = `
        <strong>${escapeHtml(idea.title)}</strong><br>
        ${idea.description ? escapeHtml(idea.description.substring(0, 200)) : ''}
        ${idea.description && idea.description.length > 200 ? '…' : ''}
        <br><small>Реалистичность: ${idea.realism}/10</small>
      `;
    } else {
      document.getElementById('randomIdeaContent').innerHTML = 'Ошибка загрузки идей.';
    }
  } catch (e) {
    console.error('loadRandomIdea error', e);
    document.getElementById('randomIdeaContent').innerHTML = 'Не удалось загрузить идеи.';
  }
}

async function copyStatsForAI() {
  try {
    const period = 'all';
    const data = await fetchJson(`/api/stats/period?period=${period}`);
    if (data.status !== 'success') throw new Error('No data');
    const streaksData = await fetchJson('/api/stats/streaks');
    // Вычисляем простой прогноз по последним дням
    let predictionText = '';
    try {
      const weekData = await fetchJson('/api/stats/period?period=week');
      if (weekData.status === 'success' && weekData.days_data && weekData.days_data.length > 0) {
        const stValues = weekData.days_data.map(d => d.ST || 0);
        const currentST = stValues[stValues.length-1];
        let predicted = currentST;
        if (stValues.length > 1) {
          const trend = currentST - stValues[stValues.length-2];
          predicted = currentST + trend;
        }
        predictionText = `${currentST.toFixed(2)} → ${predicted.toFixed(2)} (тренд)`;
      }
    } catch(e) { /* ignore */ }

    let text = `=== СТАТИСТИКА ДИСЦИПЛИНЫ (${new Date().toISOString().slice(0,10)}) ===\n\n`;
    text += `📅 Всего дней: ${data.stats.days_count}\n`;
    text += `📊 Средние за всё время: I=${data.stats.avg_i.toFixed(2)} S=${data.stats.avg_s.toFixed(2)} W=${data.stats.avg_w.toFixed(2)} E=${data.stats.avg_e.toFixed(2)} C=${data.stats.avg_c.toFixed(2)} H=${data.stats.avg_h.toFixed(2)} ST=${data.stats.avg_st.toFixed(2)} $\n`;
    text += `🔥 Стрики: ${Object.values(streaksData.streaks || {}).map(s => `${s.habit_name}:${s.current_streak}`).join(', ') || 'нет'}\n`;
    if (predictionText) text += `🔮 Прогноз ST на завтра: ${predictionText}\n`;
    text += `\n=== Дневные данные (последние 30 дней) ===\n`;
    const days = data.days_data || [];
    const last30 = days.slice(-30);
    for (const d of last30) {
      text += `${d.date}: I=${d.I?.toFixed(2) || 0} S=${d.S?.toFixed(2) || 0} W=${d.W?.toFixed(2) || 0} E=${d.E?.toFixed(2) || 0} C=${d.C?.toFixed(2) || 0} H=${d.H?.toFixed(2) || 0} ST=${d.ST?.toFixed(2) || 0}\n`;
    }

    text += `\n=== Нереализованные идеи (${allIdeas.length}) ===\n`;
    allIdeas.slice(0, 5).forEach(idea => {
      text += `- ${idea.title} (реалистичность ${idea.realism}/10)\n`;
    });

    await navigator.clipboard.writeText(text);
    alert('✅ Статистика скопирована в буфер обмена!');
  } catch (e) {
    console.error('copyStatsForAI error', e);
    alert('Не удалось скопировать: ' + e.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

async function loadPeriodStats(period) {
  try {
    const data = await fetchJson(`/api/stats/period?period=${period}`);
    if (data.status === 'success') {
      currentPeriodData = data;
      document.getElementById('periodJson').textContent = JSON.stringify(data, null, 2);
      if (period === currentChartPeriod) {
        renderCharts(data.days_data || []);
      }
    } else {
      document.getElementById('periodJson').textContent = 'Ошибка загрузки данных.';
    }
  } catch (e) {
    console.error('loadPeriodStats error', e);
    document.getElementById('periodJson').textContent = `Ошибка: ${e.message}`;
  }
}

// ... (existing code up to loadRecommendations)

// New: Load random thought from completions
async function loadRandomThought() {
  try {
    const resp = await fetchJson('/api/stats/random_thought');
    if (resp.status === 'success') {
      if (resp.thought) {
        document.getElementById('randomThoughtContent').innerHTML = `“${escapeHtml(resp.thought)}”`;
      } else {
        document.getElementById('randomThoughtContent').innerHTML = 'Пока нет записанных мыслей. Добавьте комментарий в отчёте!';
      }
    } else {
      document.getElementById('randomThoughtContent').innerHTML = 'Ошибка загрузки мысли.';
    }
  } catch (e) {
    console.error('loadRandomThought error', e);
    document.getElementById('randomThoughtContent').innerHTML = 'Не удалось загрузить мысль.';
  }
}

// Enhanced recommendations with all characteristics
function getSuggestion(key) {
  const suggestions = {
    I: 'Попробуй добавить задачи на обучение, чтение, решение головоломок.',
    S: 'Проведи время с близкими, позвони другу, поучаствуй в сообществе.',
    W: 'Укрепи волю: выполни сложную задачу первой, используй таймер Pomodoro.',
    E: 'Практикуй осознанность, веди дневник эмоций, сделай паузу.',
    C: 'Займись творчеством: рисуй, пиши, генерируй идеи.',
    H: 'Удели внимание сну, питанию, физической активности.',
    ST: 'Включи в план задачи, требующие силы духа (ранний подъём, спорт).',
    money: 'Пересмотри расходы, поставь финансовую цель.'
  };
  return suggestions[key] || 'Попробуй скорректировать привычки.';
}

async function loadRecommendations() {
  try {
    const weekData = await fetchJson('/api/stats/period?period=week');
    if (weekData.status !== 'success') {
      document.getElementById('recommendationsList').innerHTML = 'Недостаточно данных для рекомендаций.';
      return;
    }
    const weekAvg = weekData.stats;
    const daysData = weekData.days_data || [];
    const stValues = daysData.map(d => d.ST || 0);
    const trend = stValues.length > 1 ? stValues[stValues.length-1] - stValues[stValues.length-2] : 0;

    const recs = [];

    const thresholds = {
      I: 0.2, S: 0.2, W: 0.2, E: 0.2, C: 0.2, H: 0.3, ST: 0.5, money: 10
    };
    const names = {
      I: 'Интеллект', S: 'Социальное', W: 'Воля', E: 'Эмоции', C: 'Креативность', H: 'Здоровье', ST: 'Сила', money: 'Деньги'
    };

    for (const [key, threshold] of Object.entries(thresholds)) {
      const avg = weekAvg[`avg_${key}`] || 0;
      if (avg < threshold) {
        recs.push(`⚠️ Низкий ${names[key]} (${avg.toFixed(2)}). ` + getSuggestion(key));
      } else if (avg > threshold * 2) {
        recs.push(`🌟 Отличный ${names[key]} (${avg.toFixed(2)}). Продолжай в том же духе!`);
      }
    }

    if (trend < -0.1) recs.push('📉 Тренд ST падает. Обрати внимание на самые эффективные привычки.');
    if (trend > 0.2) recs.push('📈 Хороший рост! Закрепляй успех, не снижай темп.');

    if (recs.length === 0) recs.push('Пока всё стабильно. Держи дисциплину!');

    document.getElementById('recommendationsList').innerHTML = recs.map(r => `• ${r}`).join('<br>');
  } catch (e) {
    console.error('loadRecommendations error', e);
    document.getElementById('recommendationsList').innerHTML = 'Не удалось сформировать рекомендации.';
  }
}

function getSuggestion(key) {
  const suggestions = {
    I: 'Попробуй добавить задачи на обучение, чтение, решение головоломок.',
    S: 'Займись физическими тренировками на силу.',
    W: 'Займись физическими тренировками на выносливость.',
    E: 'Практикуй осознанность, веди дневник эмоций, сделай паузу.',
    C: 'Займись творчеством: рисуй, пиши, генерируй идеи.',
    H: 'Удели внимание сну, питанию, физической активности.',
    ST: 'Включи в план задачи, требующие силы духа (ранний подъём, спорт).',
    money: 'Пересмотри расходы, поставь финансовую цель.'
  };
  return suggestions[key] || 'Попробуй скорректировать привычки.';
}

async function init() {
  initCharts();

  await Promise.all([
    loadAllTimeStats(),
    loadStreaks(),
    loadAvgST('week'),
    loadMLPrediction(),
    loadDailyComparison(),
    loadRecommendations(),
    loadRandomIdea(),
    loadRandomThought(),          // <-- add this
    loadPeriodStats('week')
  ]);

  document.getElementById('refreshThoughtBtn').addEventListener('click', loadRandomThought);
  await loadRandomThought();

  document.getElementById('chartWeek').addEventListener('click', () => {
    currentChartPeriod = 'week';
    document.getElementById('chartWeek').classList.add('active');
    document.getElementById('chartMonth').classList.remove('active');
    document.getElementById('chartAll').classList.remove('active');
    loadPeriodForCharts('week');
  });
  document.getElementById('chartMonth').addEventListener('click', () => {
    currentChartPeriod = 'month';
    document.getElementById('chartWeek').classList.remove('active');
    document.getElementById('chartMonth').classList.add('active');
    document.getElementById('chartAll').classList.remove('active');
    loadPeriodForCharts('month');
  });
  document.getElementById('chartAll').addEventListener('click', () => {
    currentChartPeriod = 'all';
    document.getElementById('chartWeek').classList.remove('active');
    document.getElementById('chartMonth').classList.remove('active');
    document.getElementById('chartAll').classList.add('active');
    loadPeriodForCharts('all');
  });

  document.getElementById('btnWeek').addEventListener('click', () => loadPeriodStats('week'));
  document.getElementById('btnMonth').addEventListener('click', () => loadPeriodStats('month'));
  document.getElementById('btnAll').addEventListener('click', () => loadPeriodStats('all'));

  document.getElementById('refreshIdeaBtn').addEventListener('click', loadRandomIdea);
  document.getElementById('copyStatsBtn').addEventListener('click', copyStatsForAI);

  loadPeriodForCharts('week');
}

init().catch(err => {
  console.error(err);
  const errDiv = document.createElement('div');
  errDiv.style.color = 'red';
  errDiv.style.marginTop = '12px';
  errDiv.textContent = `Ошибка инициализации: ${err.message}`;
  document.querySelector('.main-content').prepend(errDiv);
});