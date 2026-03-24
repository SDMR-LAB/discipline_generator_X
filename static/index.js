async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

function humanPercent(x) {
  return Number.isFinite(x) ? `${x.toFixed(1)}%` : '—';
}

function renderComparison(comparison) {
  const root = document.getElementById('dailyComparison');
  root.innerHTML = '';
  if (!comparison || !Object.keys(comparison).length) {
    root.textContent = 'Нет данных для сравнения.';
    return;
  }
  Object.entries(comparison).forEach(([key, symbol]) => {
    const item = document.createElement('article');
    item.className = 'stat-item';
    item.innerHTML = `<strong>${key}</strong><span>${symbol}</span>`;
    root.appendChild(item);
  });
}

async function loadStats(period) {
  const periodData = await fetchJson(`/api/stats/period?period=${period}`);
  if (periodData.status !== 'success') return;
  const stats = periodData.stats;

  if (period === 'week') {
    document.getElementById('avgIValue').textContent = (stats.avg_i || 0).toFixed(2);
    document.getElementById('avgSTValue').textContent = (stats.avg_st || 0).toFixed(2);
  }

  if (period === 'all') {
    // Количество дней дисциплины
    document.getElementById('totalDaysValue').textContent = stats.days_count;
    updateDisciplineCounter();
  }

  document.getElementById('periodJson').textContent = JSON.stringify(periodData, null, 2);
}

async function loadStreaks() {
  const streaksData = await fetchJson('/api/stats/streaks');
  if (streaksData.status !== 'success') return;
  const streaks = Object.values(streaksData.streaks || {});
  const current = streaks.reduce((max, s) => Math.max(max, s.current_streak || 0), 0);
  const best = streaks.reduce((max, s) => Math.max(max, s.max_streak || 0), 0);
  document.getElementById('currentStreakValue').textContent = `${current} 🧨`;
  document.getElementById('bestStreakValue').textContent = `${best} 🔥`;
  updateDisciplineCounter();
}

function updateDisciplineCounter() {
  const totalDays = parseInt(document.getElementById('totalDaysValue').textContent) || 0;
  const currentStreakText = document.getElementById('currentStreakValue').textContent;
  const currentStreak = parseInt(currentStreakText.split(' ')[0]) || 0;
  const disciplineValue = totalDays + currentStreak;

  // Этапы по 100 дней
  const currentMilestone = Math.floor(disciplineValue / 100) * 100 + 100;
  const progressInStage = disciplineValue % 100;
  const progressPercent = (progressInStage / 100) * 100;

  document.getElementById('disciplineCounterValue').textContent = `${disciplineValue} 💪`;
  document.getElementById('disciplineProgressFill').style.width = `${progressPercent}%`;
  document.getElementById('disciplineProgressText').textContent = `${disciplineValue}/${currentMilestone} дней`;

  // Если достиг milestone, поздравить (но не менять автоматически)
  if (disciplineValue >= currentMilestone) {
    document.getElementById('disciplineProgressText').textContent += ' — Поздравляю! Достигнуто!';
  }
}

async function loadDailyComparison() {
  const now = new Date().toISOString().slice(0, 10);
  const cmp = await fetchJson(`/api/stats/daily_comparison?date=${now}`);
  if (cmp.status !== 'success') return;
  renderComparison(cmp.comparison);
}

async function loadMLPrediction() {
  const predict = await fetchJson('/api/stats/ml_predict');
  if (predict.status !== 'success') {
    document.getElementById('predictionValue').textContent = 'Нет прогноза';
    return;
  }
  document.getElementById('predictionValue').textContent = `${predict.current_st} → ${predict.predicted_st.toFixed(2)} (модель)`;
}

async function init() {
  document.getElementById('btnWeek').addEventListener('click', () => loadStats('week'));
  document.getElementById('btnMonth').addEventListener('click', () => loadStats('month'));
  document.getElementById('btnAll').addEventListener('click', () => loadStats('all'));

  await loadStats('week');
  await loadStats('all');
  await loadStreaks();
  await loadDailyComparison();
  await loadMLPrediction();
}

init().catch(err => {
  console.error(err);
  const body = document.body;
  const errEl = document.createElement('div');
  errEl.style.color = 'red';
  errEl.style.marginTop = '12px';
  errEl.textContent = `Ошибка загрузки дашборда: ${err.message}`;
  body.insertBefore(errEl, body.firstChild);
});