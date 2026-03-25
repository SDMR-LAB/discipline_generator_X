// Report Generator JavaScript - Migrated to new architecture
// Uses new API endpoints: /api/completions, /api/completion_habits, /api/habits, /api/combinations, /api/stats/*

// ========== Utility Functions ==========
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const b = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((b - a) / 86400000);
}

function parseCharacteristics(text) {
  const stats = { I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0 };
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
  return `I[${ stats.I.toFixed(2)}] S[${ stats.S.toFixed(2)}] W[${ stats.W.toFixed(2)}] E[${ stats.E.toFixed(2)}] C[${ stats.C.toFixed(2)}] H[${ stats.H.toFixed(2)}] ST[${ Number(stats.ST).toFixed(2)}] $[${ stats.$}]`;
}

function calculateTotalStats(parsed, friction = 1) {
  const totals = { I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0 };
  const mult = 1 + (friction - 1) / 9;
  
  parsed.forEach(item => {
    if (item.type === "habit" && item.success) {
      for (const k in totals) {
        totals[k] += (item.stats[k] || 0) * mult;
      }
    }
  });
  return totals;
}

function calculateStatSum(stats) {
  if (!stats) return 0;
  const keys = ["I", "S", "W", "E", "C", "H"];
  return keys.reduce((acc, k) => acc + (Number(stats[k]) || 0), 0);
}

function calculateImprovementPercent(totals, baseTotals) {
  const dailySum = calculateStatSum(totals);
  if (!baseTotals) return dailySum;
  const baseSum = calculateStatSum(baseTotals);
  if (baseSum === 0) return dailySum;
  return (dailySum / baseSum) * 100;
}

function formatStreaksSummary() {
  const active = Object.entries(streaksData)
    .filter(([_id, s]) => s.current > 0)
    .map(([id, s]) => {
      const habit = habitsCatalog.find(h => Number(h.id) === Number(id));
      const name = habit ? habit.name : `habit#${id}`;
      return `${name} 🔥${s.current}`;
    });

  return active.length ? active.join(', ') : 'нет активных стриков';
}

function renderTotalStats(totals) {
  const el = document.getElementById("totalStats");
  if (!el) return;
  const order = ["I", "S", "W", "E", "C", "H", "ST", "$"];
  el.innerHTML = order.map(k => `<div class="stat-item"><strong>${k}:</strong> ${totals[k].toFixed(2)}</div>`).join("");
}

let habitsCatalog = [];
let combosCatalog = [];
let streaksData = {};
let parsed = [];
let allTimeTotals = null;

let currentFinanceData = [];
let currentBiometricData = { intakes: [], meals: [], measurements: [], activities: [], mental: [] };
let substancesCatalog = []; // для подстановки названий веществ

const elements = {
  todayDisplay: document.getElementById("todayDisplay"),
  currentDayDisplay: document.getElementById("currentDayDisplay"),
  reportDateEl: document.getElementById("reportDate"),
  tasksInput: document.getElementById("tasksInput"),
  parseBtn: document.getElementById("parseBtn"),
  saveBtn: document.getElementById("saveBtn"),
  loadBtn: document.getElementById("loadBtn"),
  clearBtn: document.getElementById("clearBtn"),
  sampleBtn: document.getElementById("sampleBtn"),
  loadFromDBBtn: document.getElementById("loadFromDBBtn"),
  saveToDBBtn: document.getElementById("saveToDBBtn"),
  addFromCatalogBtn: document.getElementById("addFromCatalogBtn"),
  tasksList: document.getElementById("tasksList"),
  makeReportBtn: document.getElementById("makeReport"),
  reportOutput: document.getElementById("reportOutput"),
  copyReport: document.getElementById("copyReport"),
  downloadReport: document.getElementById("downloadReport"),
  completedCount: document.getElementById("completedCount"),
  totalCount: document.getElementById("totalCount"),
  percentDone: document.getElementById("percentDone"),
  stateSelect: document.getElementById("stateSelect"),
  thoughtsInput: document.getElementById("thoughtsInput"),
  dbDateSelect: document.getElementById("dbDateSelect"),
  frictionIndex: document.getElementById("frictionIndex"),
  frictionValue: document.getElementById("frictionValue"),
  lastDayEl: document.getElementById("lastDay"),
  lastDateEl: document.getElementById("lastDate"),
  diffDaysEl: document.getElementById("diffDays"),
};

async function fetchAPI(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!data || data.status !== "success") throw new Error(data?.message || "API Error");
  return data;
}

async function loadHabitsCatalog() {
  try {
    const data = await fetchAPI("/api/habits/list");
    habitsCatalog = data.data;
  } catch (e) { console.error("loadHabitsCatalog", e); }
}

async function loadCombinations() {
  try {
    const data = await fetchAPI("/api/combinations/list");
    combosCatalog = data.data;
  } catch (e) { console.error("loadCombinations", e); }
}

async function loadStreaks() {
  try {
    const data = await fetchAPI("/api/stats/streaks");
    streaksData = {};
    Object.keys(data.streaks).forEach(habitId => {
      streaksData[habitId] = {
        current: data.streaks[habitId].current_streak,
        longest: data.streaks[habitId].max_streak
      };
    });
    renderTasks();
  } catch (e) { console.error("loadStreaks", e); }
}

async function loadDatesFromDB() {
  try {
    const data = await fetchAPI("/api/stats/period?period=all");
    console.log("loadDatesFromDB: stats response:", data);

    if (data.stats) {
      allTimeTotals = {
        I: Number(data.stats.sum_i || 0),
        S: Number(data.stats.sum_s || 0),
        W: Number(data.stats.sum_w || 0),
        E: Number(data.stats.sum_e || 0),
        C: Number(data.stats.sum_c || 0),
        H: Number(data.stats.sum_h || 0),
        ST: Number(data.stats.sum_st || 0),
        $: Number(data.stats.sum_money || 0)
      };
    }

    const dates = (data.days_data || []).map(d => d.date).sort().reverse();
    console.log("loadDatesFromDB: dates loaded:", dates);
    elements.dbDateSelect.innerHTML = "<option value=\"\">Выберите дату</option>" +
      dates.map(d => `<option value="${d}">${d}</option>`).join("");

    updateReportOutput();
  } catch (e) { console.error("loadDatesFromDB", e); }
}

async function loadPeriodStats(period) {
  try {
    const data = await fetchAPI(`/api/stats/period?period=${period}`);
    displayPeriodStats(data, period);
    if (period === 'all' && data.stats) {
      allTimeTotals = {
        I: Number(data.stats.sum_i || 0),
        S: Number(data.stats.sum_s || 0),
        W: Number(data.stats.sum_w || 0),
        E: Number(data.stats.sum_e || 0),
        C: Number(data.stats.sum_c || 0),
        H: Number(data.stats.sum_h || 0),
        ST: Number(data.stats.sum_st || 0),
        $: Number(data.stats.sum_money || 0)
      };
      updateReportOutput();
    }
  } catch (e) {
    console.error('loadPeriodStats', e);
  }
}

function displayPeriodStats(data, period) {
  const container = document.getElementById('periodStatsDisplay');
  if (!container) return;
  const periodNames = { week: 'неделю', month: 'месяц', all: 'все время' };
  let html = `<strong>За ${periodNames[period]}:</strong> `;
  if (data.stats) {
    html += `${data.stats.days_count || 0} дней, `;
    html += `I:${Number(data.stats.avg_i || 0).toFixed(2)} `;
    html += `S:${Number(data.stats.avg_s || 0).toFixed(2)} `;
    html += `W:${Number(data.stats.avg_w || 0).toFixed(2)}`;
  } else {
    html += 'нет данных';
  }
  if (data.comparison) {
    html += '<br>Сравнение: ';
    const changes = [];
    Object.keys(data.comparison).forEach(key => {
      if (data.comparison[key] !== '→') {
        changes.push(`${key}${data.comparison[key]}`);
      }
    });
    html += changes.length > 0 ? changes.join(' ') : 'без изменений';
  }
  container.innerHTML = html;
}

async function loadDayFromDB() {
  const date = elements.dbDateSelect.value;
  if (!date) return;
  try {
    console.log("loadDayFromDB: loading date:", date);
    const completion = await fetchAPI(`/api/completions/list?date=${date}`);
    console.log("loadDayFromDB: completion response:", completion);
    if (!completion.data.length) throw new Error("День не найден");
    const day = completion.data[0];
    console.log("loadDayFromDB: day data:", day);
    const habits = await fetchAPI(`/api/completion_habits/list?completion_id=${day.id}`);
    console.log("loadDayFromDB: habits response:", habits);
    
    let text = "";
    let currentCategory = null;
    const friction = day.friction_index || 1;
    
    for (const h of habits.data) {
      if (h.category !== currentCategory) {
        if (currentCategory) text += "\n";
        currentCategory = h.category;
        text += `${h.category}\n———————————————\n`;
      }
      const sign = h.success ? "+" : "-";
      const quantity = h.quantity ? ` — ${h.quantity} ${h.unit || ""}` : "";
      const stats = formatStats({ I: h.i, S: h.s, W: h.w, E: h.e, C: h.c, H: h.hh, ST: h.st, $: h.money });
      text += `${sign} ${h.name}${quantity} ${stats}\n`;
    }
    
    currentFinanceData = await loadFinanceData(date);
    currentBiometricData = await loadBiometricData(date);
    await loadSubstancesCatalog(); // подгрузим справочник веществ для отображения

    elements.tasksInput.value = text;
    elements.reportDateEl.value = date;
    elements.lastDateEl.value = date;
    elements.lastDayEl.value = day.day_number || elements.lastDayEl.value || "0";
    elements.frictionIndex.value = friction;
    elements.frictionValue.textContent = friction;
    elements.thoughtsInput.value = day.thoughts || "";
    elements.stateSelect.value = day.state || "WORK";

    parseTextInput();
    renderMeta();
    await updateReportOutput();
    console.log("loadDayFromDB: day loaded successfully");
  } catch (e) { console.error("loadDayFromDB:", e); alert("Ошибка: " + e.message); }
}

function parseTextToStructure(text) {
  const lines = text.split("\n");
  const result = [];
  let currentCategory = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) {
      result.push({ type: "blank" });
      continue;
    }

    // Пропускаем разделители (строки из дефисов или тире)
    const isSeparator = /^[—\-–−—]+$/.test(line) || /^-{3,}$/.test(line) || /^={3,}$/.test(line);
    if (isSeparator) {
      continue;
    }

    // Проверяем, это ли категория (не начинается с +, -, или *)
    const isHabitLine = line.startsWith("+") || line.startsWith("-") || line.startsWith("*");
    if (!isHabitLine) {
      // Это категория
      currentCategory = line;
      result.push({ type: "category", text: line });
      continue;
    }

    // Это привычка
    if (line.startsWith("+") || line.startsWith("-")) {
      const success = line.startsWith("+");
      let habitText = line.substring(1).trim();

      // Парсим статистику
      const statsMatch = habitText.match(/(.+?)\s+(I\[.*?\].*)/);
      let name = habitText;
      let stats = { I: 0, S: 0, W: 0, E: 0, C: 0, H: 0, ST: 0, $: 0 };
      let quantity = null, unit = null;

      if (statsMatch) {
        habitText = statsMatch[1];
        stats = parseCharacteristics(statsMatch[2]);
      }

      // Парсим количество и единицу (например "30 мин", "2л", "4 часа")
      const quantMatch = habitText.match(/(.+?)\s*—\s*(\d+(?:\.\d+)?)\s*(.+?)$/);
      if (quantMatch) {
        name = quantMatch[1];
        quantity = parseFloat(quantMatch[2]);
        unit = quantMatch[3];
      } else {
        name = habitText;
      }

      const habitObj = {
        type: "habit",
        name: name.trim(),
        category: currentCategory || "Без категории",
        success,
        quantity,
        unit,
        stats
      };

      result.push(habitObj);
    }
  }

  return result;
}

function parseTextInput() {
  parsed = parseTextToStructure(elements.tasksInput.value);
  console.log("📊 Parsed habits:", parsed.filter(p => p.type === "habit").map(h => ({ name: h.name, category: h.category })));
  renderTasks();
  renderMeta();
  // Вычитаем и рендерим caractеристики
  const friction = parseInt(elements.frictionIndex.value) || 1;
  const totals = calculateTotalStats(parsed, friction);
  renderTotalStats(totals);
}


function renderTasks() {
  const container = elements.tasksList;
  if (!container) return;
  container.innerHTML = "";
  let currentCategory = null;

  parsed.forEach((item, idx) => {
    if (item.type === "blank") {
      const br = document.createElement("div");
      br.style.height = "8px";
      container.appendChild(br);
      return;
    }
    if (item.type === "category") {
      currentCategory = item.text;
      const sec = document.createElement("div");
      sec.className = "section";
      const h3 = document.createElement("h3");
      h3.textContent = currentCategory;
      sec.appendChild(h3);
      container.appendChild(sec);
      return;
    }

    if (item.type === "habit") {
      const catalogHabit = habitsCatalog.find(h => h.name === item.name && h.category === item.category);
      const streakHtml = catalogHabit && streaksData[catalogHabit.id] && streaksData[catalogHabit.id].current > 0
        ? `<span class="streak-fire">🔥${streaksData[catalogHabit.id].current}</span>`
        : "";
      
      const el = document.createElement("div");
      el.className = `task ${catalogHabit ? "habit-from-db" : ""}`;
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.gap = "8px";
      el.style.padding = "8px";
      el.style.border = "1px solid #eee";
      el.style.borderRadius = "6px";
      el.style.margin = "4px 0";

      const btn = document.createElement("button");
      btn.className = "toggle";
      btn.textContent = item.success ? "[+]" : "[-]";
      btn.onclick = () => {
        item.success = !item.success;
        btn.textContent = item.success ? "[+]" : "[-]";
        renderMeta();
        updateReportOutput();
        // Пересчитать характеристики
        const friction = parseInt(elements.frictionIndex.value) || 1;
        const totals = calculateTotalStats(parsed, friction);
        renderTotalStats(totals);
      };

      const textDiv = document.createElement("div");
      textDiv.style.flex = "1";
      let nameText = item.name;
      if (item.quantity) nameText += ` — ${item.quantity} ${item.unit || ""}`;
      textDiv.innerHTML = `${nameText} ${streakHtml}`;

      const controls = document.createElement("div");
      controls.className = "habit-controls";
      if (catalogHabit) {
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "×";
        removeBtn.className = "small";
        removeBtn.onclick = () => { parsed = parsed.filter(p => !(p.type === "habit" && p.name === item.name && p.category === item.category)); renderTasks(); renderMeta(); };
        controls.appendChild(removeBtn);
      } else {
        const addBtn = document.createElement("button");
        addBtn.textContent = "+ BD";
        addBtn.className = "small";
        addBtn.onclick = () => addHabitToCatalog(item, item.category);
        controls.appendChild(addBtn);
      }

      const editBtn = document.createElement("button");
      editBtn.textContent = "✎";
      editBtn.className = "small";
      editBtn.onclick = () => showEditHabitModal(idx, item.category);
      controls.appendChild(editBtn);

      el.appendChild(btn);
      el.appendChild(textDiv);
      el.appendChild(controls);
      container.appendChild(el);
    }
  });
}

function computeDayNumber() {
  const reportDate = elements.reportDateEl.value ? new Date(elements.reportDateEl.value) : new Date();
  const lastDateVal = elements.lastDateEl.value ? new Date(elements.lastDateEl.value) : null;
  const lastDayVal = parseInt(elements.lastDayEl.value, 10) || 0;
  if (lastDateVal) {
    return lastDayVal + daysBetween(lastDateVal, reportDate);
  }
  return lastDayVal;
}

function renderMeta() {
  const systemToday = new Date();
  elements.todayDisplay.textContent = toISODate(systemToday);

  const reportDate = elements.reportDateEl.value ? new Date(elements.reportDateEl.value) : new Date();
  const lastDateVal = elements.lastDateEl.value ? new Date(elements.lastDateEl.value) : null;
  const dayNumber = computeDayNumber();

  if (lastDateVal) {
    const diff = daysBetween(lastDateVal, reportDate);
    elements.diffDaysEl.textContent = diff;
    elements.currentDayDisplay.textContent = String(dayNumber);
  } else {
    elements.diffDaysEl.textContent = "—";
    elements.currentDayDisplay.textContent = String(dayNumber);
  }

  let total = 0, completed = 0;
  parsed.forEach(item => {
    if (item.type === "habit") {
      total++;
      if (item.success) completed++;
    }
  });

  elements.totalCount.textContent = total;
  elements.completedCount.textContent = completed;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  elements.percentDone.textContent = pct + "%";

  const friction = parseInt(elements.frictionIndex.value) || 1;
  const totals = calculateTotalStats(parsed, friction);
  renderTotalStats(totals);
}

async function updateReportOutput() {
  const friction = parseInt(elements.frictionIndex.value) || 1;
  const totals = calculateTotalStats(parsed, friction);

  let report = `✨🎉 === ОТЧЁТ ДИСЦИПЛИНЫ === 🎉✨\n\n`;
  report += `📅 Дата: ${elements.reportDateEl.value || toISODate(new Date())}\n`;
  report += `📈 День: ${elements.currentDayDisplay.textContent}\n`;
  report += `⚙️ Трение: ${friction}/10\n`;
  report += `🧾 Статус: ${elements.stateSelect.value}\n`;
  report += `✅ Выполнено: ${elements.completedCount.textContent}/${elements.totalCount.textContent} (${elements.percentDone.textContent})\n`;
  report += `🔥 Стрики: ${formatStreaksSummary()}\n`;
  const dayNumber = computeDayNumber();

  report += `\n=== ХАРАКТЕРИСТИКИ ===\n`;
  const stats = ["I", "S", "W", "E", "C", "H", "ST", "$"];
  stats.forEach(s => {
    const val = totals[s].toFixed(2);
    const allTime = allTimeTotals ? allTimeTotals[s].toFixed(2) : "—";
    report += `${s}: ${val} (всего: ${allTime})\n`;
  });

  const dailySum = calculateStatSum(totals);
  const overallPercent = calculateImprovementPercent(totals, allTimeTotals);

  report += `\n💪 Я стал лучше на +%${dailySum.toFixed(2)}\n`;
  if (allTimeTotals) {
    const allTimeSum = calculateStatSum(allTimeTotals);
    const ratio = allTimeSum > 0 ? (dailySum / allTimeSum * 100).toFixed(2) : "—";
    report += `🌍 Доля в общем прогрессе: ${ratio}% (из +%${allTimeSum.toFixed(2)})\n`;
  }
  if (overallPercent !== null && allTimeTotals) {
    report += `📊 Отношение к суммарному прогрессу: ${overallPercent.toFixed(2)}%\n`;
  }

  report += `\n📅 ДЕНЬ ДИСЦИПЛИНЫ: ${dayNumber}`;

  if (elements.thoughtsInput.value) {
    report += `\n=== КОММЕНТАРИЙ ===\n${elements.thoughtsInput.value}\n`;
  }

  report += `\n=== ПРИВЫЧКИ ===\n`;
  let lastCategory = null;
  parsed.forEach(item => {
    if (item.type === "category") {
      lastCategory = item.text;
      report += `\n${item.text}\n`;
    } else if (item.type === "habit") {
      const sign = item.success ? "+" : "-";
      const qty = item.quantity ? ` — ${item.quantity} ${item.unit || ""}` : "";
      const catalogHabit = habitsCatalog.find(h => h.name === item.name && h.category === item.category);
      const streak = catalogHabit && streaksData[catalogHabit.id] ? streaksData[catalogHabit.id].current : 0;
      const streakText = streak > 0 ? ` 🔥${streak}` : "";
      const statusIcon = item.success ? "✅" : "❌";
      report += `  ${statusIcon} ${sign} ${item.name}${qty}${streakText}\n`;
    }
  });

  // === ФИНАНСЫ ===
  if (currentFinanceData && currentFinanceData.length > 0) {
      report += `\n=== ФИНАНСЫ ===\n`;
      // Получим категории для подстановки
      let categories = [];
      try {
          const catData = await fetchAPI("/api/finance_categories/list");
          categories = catData.data;
      } catch(e) { /* ignore */ }
      const catMap = {};
      categories.forEach(c => { catMap[c.id] = c; });

      let incomeSum = 0, expenseSum = 0;
      for (const tx of currentFinanceData) {
          const cat = catMap[tx.category_id];
          const catName = cat ? cat.name : '—';
          const sign = cat && cat.type === 'income' ? '+' : '-';
          report += `${sign} ${catName}: ${tx.amount.toFixed(2)}${tx.description ? ` (${tx.description})` : ''}\n`;
          if (cat && cat.type === 'income') incomeSum += tx.amount;
          else expenseSum += tx.amount;
      }
      report += `Итого: доход ${incomeSum.toFixed(2)}, расход ${expenseSum.toFixed(2)}, чистая прибыль ${(incomeSum - expenseSum).toFixed(2)}\n`;
  }

  // === ПРИНЯТЫЕ ВЕЩЕСТВА ===
  if (currentBiometricData.intakes && currentBiometricData.intakes.length > 0) {
      report += `\n=== ПРИНЯТЫЕ ВЕЩЕСТВА ===\n`;
      const substanceMap = {};
      substancesCatalog.forEach(s => { substanceMap[s.id] = s; });
      for (const intake of currentBiometricData.intakes) {
          const sub = substanceMap[intake.substance_id];
          const status = intake.taken ? '✓' : '✗';
          report += `${sub ? sub.name : `Вещество #${intake.substance_id}`}: ${status}\n`;
      }
  }

  // === РАЦИОН ===
  if (currentBiometricData.meals && currentBiometricData.meals.length > 0) {
      report += `\n=== РАЦИОН ===\n`;
      for (const meal of currentBiometricData.meals) {
          const mealType = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' }[meal.meal_type] || meal.meal_type;
          report += `${mealType}: ${meal.description || ''}${meal.calories ? ` (${meal.calories} ккал)` : ''}\n`;
          if (meal.notes) report += `  Примечание: ${meal.notes}\n`;
      }
  }

  // === ФИЗИЧЕСКИЕ ИЗМЕРЕНИЯ ===
  if (currentBiometricData.measurements && currentBiometricData.measurements.length > 0) {
      report += `\n=== ИЗМЕРЕНИЯ ===\n`;
      for (const m of currentBiometricData.measurements) {
          const parts = [];
          if (m.weight) parts.push(`Вес: ${m.weight} кг`);
          if (m.body_fat_percent) parts.push(`% жира: ${m.body_fat_percent}`);
          if (m.muscle_mass) parts.push(`Мышечная масса: ${m.muscle_mass} кг`);
          if (m.heart_rate) parts.push(`Пульс: ${m.heart_rate}`);
          if (m.blood_pressure_systolic && m.blood_pressure_diastolic) parts.push(`Давление: ${m.blood_pressure_systolic}/${m.blood_pressure_diastolic}`);
          report += parts.join(', ') + '\n';
          if (m.notes) report += `  Примечание: ${m.notes}\n`;
      }
  }

  // === ФИЗИЧЕСКАЯ АКТИВНОСТЬ ===
  if (currentBiometricData.activities && currentBiometricData.activities.length > 0) {
      report += `\n=== ФИЗИЧЕСКАЯ АКТИВНОСТЬ ===\n`;
      for (const a of currentBiometricData.activities) {
          report += `${a.activity_type}: ${a.duration_minutes} мин${a.intensity ? ` (интенсивность ${a.intensity}/10)` : ''}\n`;
          if (a.notes) report += `  Примечание: ${a.notes}\n`;
      }
  }

  // === МЕНТАЛЬНЫЕ ПОКАЗАТЕЛИ ===
  if (currentBiometricData.mental && currentBiometricData.mental.length > 0) {
      report += `\n=== МЕНТАЛЬНЫЕ ПОКАЗАТЕЛИ ===\n`;
      for (const m of currentBiometricData.mental) {
          const fields = [];
          if (m.focus) fields.push(`Фокус: ${m.focus}/10`);
          if (m.attention) fields.push(`Внимание: ${m.attention}/10`);
          if (m.thinking_speed) fields.push(`Быстрота мышления: ${m.thinking_speed}/10`);
          if (m.energy) fields.push(`Энергия: ${m.energy}/10`);
          if (m.mood) fields.push(`Настроение: ${m.mood}/10`);
          if (m.thinking_type) fields.push(`Тип мышления: ${m.thinking_type}`);
          report += fields.join(', ') + '\n';
          if (m.notes) report += `  Примечание: ${m.notes}\n`;
      }
  }


  elements.reportOutput.textContent = report;
}

function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "flex";
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
}

function showEditHabitModal(idx, category) {
  const item = parsed[idx];
  document.getElementById("editIndex").value = idx;
  document.getElementById("editName").value = item.name;
  document.getElementById("editCategory").value = item.category;
  document.getElementById("editQuantity").value = item.quantity || "";
  document.getElementById("editUnit").value = item.unit || "";
  document.getElementById("editSuccess").value = item.success ? "1" : "0";
  showModal("habitEditModal");
}

function addHabitToCatalog(habit, category) {
  const data = {
    name: habit.name,
    category: category || "Без категории",
    default_quantity: habit.quantity,
    unit: habit.unit,
    i: habit.stats.I, s: habit.stats.S, w: habit.stats.W,
    e: habit.stats.E, c: habit.stats.C, h: habit.stats.H,
    st: habit.stats.ST, money: habit.stats.$
  };
  fetchAPI("/api/habits/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(() => {
    alert("✓ Привычка добавлена в справочник!");
    loadHabitsCatalog().then(() => { renderTasks(); });
  }).catch(e => alert("Ошибка: " + e.message));
}

function filterHabits() {
  const search = document.getElementById("habitSearch").value.toLowerCase();
  const list = document.getElementById("habitCatalogList");
  const items = list.querySelectorAll(".habit-option");
  
  items.forEach(item => {
    const visible = item.textContent.toLowerCase().includes(search);
    item.style.display = visible ? "block" : "none";
  });
}

function updateCatalogModal() {
  const list = document.getElementById("habitCatalogList");
  if (!list) return;
  
  list.innerHTML = "";
  let currentCategory = null;
  
  habitsCatalog.forEach(habit => {
    if (habit.category !== currentCategory) {
      currentCategory = habit.category;
      const catHeader = document.createElement("div");
      catHeader.className = "category-header";
      catHeader.style.fontWeight = "bold";
      catHeader.style.padding = "8px 4px";
      catHeader.style.marginTop = "8px";
      catHeader.textContent = currentCategory;
      list.appendChild(catHeader);
    }
    
    const option = document.createElement("div");
    option.className = "habit-option";
    option.style.padding = "6px 4px";
    option.style.cursor = "pointer";
    option.style.borderRadius = "4px";
    option.onmouseover = () => option.style.backgroundColor = "#f0f0f0";
    option.onmouseout = () => option.style.backgroundColor = "transparent";
    
    let text = habit.name;
    if (habit.default_quantity) text += ` — ${habit.default_quantity}${habit.unit ? " " + habit.unit : ""}`;
    option.textContent = text;
    option.onclick = () => addHabitToText(habit);
    list.appendChild(option);
  });
}

function addHabitToText(habit) {
  const stats = formatStats({
    I: habit.i || 0, S: habit.s || 0, W: habit.w || 0,
    E: habit.e || 0, C: habit.c || 0, H: habit.h || 0,
    ST: habit.st || 0, $: habit.money || 0
  });
  
  const quantity = habit.default_quantity ? ` — ${habit.default_quantity}${habit.unit ? " " + habit.unit : ""}` : "";
  const line = `+ ${habit.name}${quantity} ${stats}\n`;
  
  const category = habit.category || "Без категории";
  const lines = elements.tasksInput.value.split("\n");
  let insertIdx = lines.length;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === category) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() && !lines[j].startsWith("+") && !lines[j].startsWith("-") && !lines[j].startsWith("—")) {
          insertIdx = j;
          break;
        }
      }
      if (insertIdx === lines.length) insertIdx = i + 1;
      break;
    }
  }
  
  lines.splice(insertIdx, 0, line.trim());
  elements.tasksInput.value = lines.join("\n");
  
  parseTextInput();
  hideModal("habitCatalogModal");
}

function saveToLocalStorage() {
  const data = {
    tasksInput: elements.tasksInput.value,
    lastDay: elements.lastDayEl.value,
    lastDate: elements.lastDateEl.value,
    reportDate: elements.reportDateEl.value,
    state: elements.stateSelect.value,
    thoughts: elements.thoughtsInput.value,
    friction: elements.frictionIndex.value,
  };
  localStorage.setItem("disciplineReport", JSON.stringify(data));
  alert("✓ Сохранено в localStorage");
}

function loadFromLocalStorage() {
  const data = JSON.parse(localStorage.getItem("disciplineReport") || "{}");
  if (data.tasksInput) elements.tasksInput.value = data.tasksInput;
  if (data.lastDay) elements.lastDayEl.value = data.lastDay;
  if (data.lastDate) elements.lastDateEl.value = data.lastDate;
  if (data.reportDate) elements.reportDateEl.value = data.reportDate;
  if (data.state) elements.stateSelect.value = data.state;
  if (data.thoughts) elements.thoughtsInput.value = data.thoughts;
  if (data.friction) {
    elements.frictionIndex.value = data.friction;
    elements.frictionValue.textContent = data.friction;
  }
  parseTextInput();
}

async function loadFinanceData(date) {
    try {
        const data = await fetchAPI(`/api/finance_transactions/list?date=${date}`);
        return data.data;
    } catch (e) {
        console.warn('Failed to load finance data', e);
        return [];
    }
}

async function loadBiometricData(date) {
    const result = {};
    try {
        result.intakes = (await fetchAPI(`/api/biometric_intake_log/list?date=${date}`)).data;
        result.meals = (await fetchAPI(`/api/biometric_meals/list?date=${date}`)).data;
        result.measurements = (await fetchAPI(`/api/biometric_measurements/list?date=${date}`)).data;
        result.activities = (await fetchAPI(`/api/biometric_physical_activity/list?date=${date}`)).data;
        result.mental = (await fetchAPI(`/api/biometric_mental_daily/list?date=${date}`)).data;
        return result;
    } catch (e) {
        console.warn('Failed to load biometric data', e);
        return { intakes: [], meals: [], measurements: [], activities: [], mental: [] };
    }
}

async function loadSubstancesCatalog() {
    try {
        const data = await fetchAPI("/api/biometric_substances/list");
        substancesCatalog = data.data;
    } catch (e) {
        console.warn("Failed to load substances", e);
        substancesCatalog = [];
    }
}

async function saveToDatabase() {
  try {
    const friction = parseInt(elements.frictionIndex.value) || 1;
    const totals = calculateTotalStats(parsed, friction);
    console.log("saveToDatabase: totals calculated:", totals);

    const completionData = {
      date: elements.reportDateEl.value || toISODate(new Date()),
      day_number: parseInt(elements.currentDayDisplay.textContent) || 1,
      state: elements.stateSelect.value,
      thoughts: elements.thoughtsInput.value,
      friction_index: friction,
      totals: totals
    };

    console.log("saveToDatabase: completionData:", completionData);
    let response = await fetchAPI(`/api/completions/list?date=${completionData.date}`);
    let completionId;

    if (response.data && response.data.length > 0) {
      completionId = response.data[0].id;
      console.log("saveToDatabase: updating existing completion:", completionId);
      await fetchAPI(`/api/completions/update/${completionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completionData)
      });
    } else {
      console.log("saveToDatabase: creating new completion");
      const create = await fetchAPI("/api/completions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completionData)
      });
      completionId = create.data.id;
      console.log("saveToDatabase: created completion:", completionId);
    }

    const old = await fetchAPI(`/api/completion_habits/list?completion_id=${completionId}`);
    for (const h of old.data) {
      await fetchAPI(`/api/completion_habits/delete/${h.id}`, { method: "DELETE" });
    }

    const rawHabits = [];
    parsed.forEach(item => {
      if (item.type === "habit") {
        rawHabits.push(item);
      }
    });

    for (const h of rawHabits) {
      const catalogHabit = habitsCatalog.find(c => c.name === h.name && c.category === h.category);
      const payload = {
        completion_id: completionId,
        habit_id: catalogHabit ? catalogHabit.id : null,
        name: h.name,
        category: h.category || "Без категории",
        success: h.success ? 1 : 0,
        quantity: h.quantity || null,
        unit: h.unit || null,
        i: h.stats.I, s: h.stats.S, w: h.stats.W,
        e: h.stats.E, c: h.stats.C, hh: h.stats.H,
        st: h.stats.ST, money: h.stats.$,
      };
      await fetchAPI("/api/completion_habits/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    alert("✓ Сохранено в БД! Categories и данные сохранены правильно.");
    loadDatesFromDB();
    loadStreaks();
  } catch (e) {
    console.error(e);
    alert("Ошибка при сохранении: " + e.message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  elements.parseBtn?.addEventListener("click", parseTextInput);
  elements.saveBtn?.addEventListener("click", saveToLocalStorage);
  elements.loadBtn?.addEventListener("click", () => {
    loadFromLocalStorage();
    alert("✓ Загружено из localStorage");
  });
  elements.clearBtn?.addEventListener("click", () => {
    if (confirm("Очистить все данные?")) {
      localStorage.removeItem("disciplineReport");
      elements.tasksInput.value = "";
      parsed = [];
      elements.thoughtsInput.value = "";
      elements.stateSelect.value = "WORK";
      renderTasks();
      renderMeta();
    }
  });
  elements.sampleBtn?.addEventListener("click", () => {
    const sampleText = `Здоровье
———————————————
+ Упражнения — 30 мин I[0.01] S[0.02] W[0.03] E[0] C[0] H[0.05] ST[1] $[0]
+ Пить воду — 2л I[0] S[0] W[0.01] E[0] C[0] H[0.02] ST[1] $[0]

Развитие
———————————————
+ Чтение — 30 страниц I[0.02] S[0.00] W[0.00] E[0.01] C[0.01] H[0.00] ST[1] $[0]

Работа
———————————————
+ Основной проект — 4 часа I[0.05] S[0.00] W[0.01] E[0.00] C[0.02] H[0.00] ST[2] $[50]`;
    
    elements.tasksInput.value = sampleText;
    elements.thoughtsInput.value = "Хороший продуктивный день!";
    parseTextInput();
    alert("✓ Пример загружен");
  });
  elements.addFromCatalogBtn?.addEventListener("click", () => {
    updateCatalogModal();
    showModal("habitCatalogModal");
  });
  elements.loadFromDBBtn?.addEventListener("click", loadDatesFromDB);
  elements.saveToDBBtn?.addEventListener("click", saveToDatabase);
  elements.makeReportBtn?.addEventListener("click", updateReportOutput);
  elements.copyReport?.addEventListener("click", () => {
    navigator.clipboard.writeText(elements.reportOutput.textContent);
    alert("📋 Скопировано в буфер!");
  });
  elements.downloadReport?.addEventListener("click", () => {
    const text = elements.reportOutput.textContent;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${toISODate(new Date())}.txt`;
    a.click();
  });

  elements.frictionIndex?.addEventListener("change", () => {
    elements.frictionValue.textContent = elements.frictionIndex.value;
    renderMeta();
  });

  document.getElementById("saveEditBtn")?.addEventListener("click", async () => {
    const idx = parseInt(document.getElementById("editIndex").value);
    const item = parsed[idx];
    if (item && item.type === "habit") {
      const oldName = item.name;
      const oldCategory = item.category;
      
      item.name = document.getElementById("editName").value;
      item.category = document.getElementById("editCategory").value;
      item.quantity = parseFloat(document.getElementById("editQuantity").value) || null;
      item.unit = document.getElementById("editUnit").value;
      item.success = document.getElementById("editSuccess").value === "1";
      
      const catalogHabit = habitsCatalog.find(h => h.name === oldName && h.category === oldCategory);
      if (catalogHabit) {
        try {
          await fetchAPI(`/api/habits/update/${catalogHabit.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.name,
              category: item.category,
              default_quantity: item.quantity,
              unit: item.unit,
            })
          });
          await loadHabitsCatalog();
        } catch (e) {
          console.warn("Error updating habit:", e);
        }
      }
      
      renderTasks();
      renderMeta();
      hideModal("habitEditModal");
    }
  });

  document.getElementById("habitSearch")?.addEventListener("input", filterHabits);

  await loadHabitsCatalog();
  await loadCombinations();
  await loadStreaks();
  await loadDatesFromDB();
  await loadPeriodStats('all');
  
  const today = toISODate(new Date());
  if (!elements.reportDateEl.value) {
    elements.reportDateEl.value = today;
  }
  
  renderMeta();
} );







