// static/biometric.js
// CRUD операции для всех сущностей биометрики

// ========== Общие утилиты ==========
async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Request failed');
    }
    return data;
}

function showModal(id) {
    document.getElementById(id).style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}
function getTodayISO() {
    return new Date().toISOString().slice(0, 10);
}

// ========== Вкладка "Вещества" ==========
let substances = [];
let intakeLog = [];

async function loadSubstances() {
    const data = await fetchJSON('/api/biometric_substances/list');
    substances = data.data;
    renderSubstancesTable();
    await loadIntakeLog(); // ← вместо renderIntakeLog()
}

function renderSubstancesTable() {
    const tbody = document.querySelector('#substancesTable tbody');
    tbody.innerHTML = '';
    substances.forEach(sub => {
        const row = tbody.insertRow();
        row.insertCell().textContent = sub.name;
        row.insertCell().textContent = sub.dosage || '';
        row.insertCell().textContent = sub.frequency || '';
        row.insertCell().textContent = sub.time_of_day || '';
        const actions = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.onclick = () => editSubstance(sub);
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.onclick = () => deleteSubstance(sub.id);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
    });
}

async function saveSubstance(substance) {
    const id = substance.id || null;
    const url = id ? `/api/biometric_substances/update/${id}` : '/api/biometric_substances/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(substance) });
    await loadSubstances();
    closeModal('substanceModal');
}

function editSubstance(sub) {
    document.getElementById('substanceId').value = sub.id;
    document.getElementById('substanceName').value = sub.name;
    document.getElementById('substanceDosage').value = sub.dosage || '';
    document.getElementById('substanceFrequency').value = sub.frequency || '';
    document.getElementById('substanceTime').value = sub.time_of_day || '';
    showModal('substanceModal');
}

async function deleteSubstance(id) {
    if (!confirm('Удалить вещество? Все связанные записи приёма будут удалены.')) return;
    await fetchJSON(`/api/biometric_substances/delete/${id}`, { method: 'DELETE' });
    await loadSubstances();
}

async function loadIntakeLog(date = getTodayISO()) {
    const data = await fetchJSON(`/api/biometric_intake_log/list?date=${date}`);
    intakeLog = data.data;
    renderIntakeLog(date);
}

function renderIntakeLog(date) {
    const container = document.getElementById('intakeLog');
    container.innerHTML = '';
    // Заголовок с выбором даты
    const datePicker = document.createElement('div');
    datePicker.className = 'intake-date-picker';
    datePicker.innerHTML = `
        <label>Дата: <input type="date" id="intakeDate" value="${date || getTodayISO()}"></label>
        <button id="refreshIntake">Обновить</button>
    `;
    container.appendChild(datePicker);
    // Таблица веществ и чекбоксы
    const table = document.createElement('table');
    table.className = 'intake-table';
    table.innerHTML = `<thead><tr><th>Вещество</th><th>Принято</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    substances.forEach(sub => {
        const entry = intakeLog.find(l => l.substance_id === sub.id);
        const taken = entry ? entry.taken : false;
        const row = tbody.insertRow();
        row.insertCell().textContent = sub.name;
        const cell = row.insertCell();
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = taken;
        chk.onchange = () => toggleIntake(sub.id, date, chk.checked);
        cell.appendChild(chk);
    });
    container.appendChild(table);

    document.getElementById('refreshIntake').onclick = () => {
        const newDate = document.getElementById('intakeDate').value;
        loadIntakeLog(newDate);
    };
}

async function toggleIntake(substanceId, date, taken) {
    // Проверяем, есть ли уже запись за эту дату
    const existing = intakeLog.find(l => l.substance_id === substanceId);
    if (existing) {
        // Обновляем
        const updated = { ...existing, taken };
        await fetchJSON(`/api/biometric_intake_log/update/${existing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
    } else {
        // Создаём
        const newEntry = { substance_id: substanceId, date, taken };
        await fetchJSON('/api/biometric_intake_log/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newEntry)
        });
    }
    // Перезагружаем журнал (чтобы обновить список)
    await loadIntakeLog(date);
}

// ========== Вкладка "Рацион" ==========
async function loadMeals() {
    const data = await fetchJSON('/api/biometric_meals/list?order_by=date DESC');
    renderMealsTable(data.data);
}

function renderMealsTable(meals) {
    const tbody = document.querySelector('#mealsTable tbody');
    tbody.innerHTML = '';
    meals.forEach(m => {
        const row = tbody.insertRow();
        row.insertCell().textContent = m.date;
        const mealType = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' }[m.meal_type] || m.meal_type;
        row.insertCell().textContent = mealType;
        row.insertCell().textContent = m.description || '';
        row.insertCell().textContent = m.calories ? m.calories.toFixed(0) : '';
        row.insertCell().textContent = m.notes || '';
        const actions = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.onclick = () => editMeal(m);
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.onclick = () => deleteMeal(m.id);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
    });
}

async function saveMeal(meal) {
    const id = meal.id || null;
    const url = id ? `/api/biometric_meals/update/${id}` : '/api/biometric_meals/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meal) });
    await loadMeals();
    closeModal('mealModal');
}

function editMeal(meal) {
    document.getElementById('mealId').value = meal.id;
    document.getElementById('mealDate').value = meal.date;
    document.getElementById('mealType').value = meal.meal_type;
    document.getElementById('mealDesc').value = meal.description || '';
    document.getElementById('mealCalories').value = meal.calories || '';
    document.getElementById('mealNotes').value = meal.notes || '';
    showModal('mealModal');
}

async function deleteMeal(id) {
    if (!confirm('Удалить запись о приёме пищи?')) return;
    await fetchJSON(`/api/biometric_meals/delete/${id}`, { method: 'DELETE' });
    await loadMeals();
}

// ========== Физические показатели ==========
async function loadMeasurements() {
    const data = await fetchJSON('/api/biometric_measurements/list?order_by=date DESC');
    renderMeasurementsTable(data.data);
}

function renderMeasurementsTable(measurements) {
    const tbody = document.querySelector('#measurementsTable tbody');
    tbody.innerHTML = '';
    measurements.forEach(m => {
        const row = tbody.insertRow();
        row.insertCell().textContent = m.date;
        row.insertCell().textContent = m.weight !== null ? m.weight.toFixed(1) : '';
        row.insertCell().textContent = m.body_fat_percent !== null ? m.body_fat_percent.toFixed(1) : '';
        row.insertCell().textContent = m.muscle_mass !== null ? m.muscle_mass.toFixed(1) : '';
        row.insertCell().textContent = m.heart_rate || '';
        row.insertCell().textContent = m.blood_pressure_systolic && m.blood_pressure_diastolic ? `${m.blood_pressure_systolic}/${m.blood_pressure_diastolic}` : '';
        const actions = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.onclick = () => editMeasurement(m);
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.onclick = () => deleteMeasurement(m.id);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
    });
}

async function saveMeasurement(measurement) {
    const id = measurement.id || null;
    const url = id ? `/api/biometric_measurements/update/${id}` : '/api/biometric_measurements/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(measurement) });
    await loadMeasurements();
    closeModal('measurementModal');
}

function editMeasurement(meas) {
    document.getElementById('measurementId').value = meas.id;
    document.getElementById('measDate').value = meas.date;
    document.getElementById('measWeight').value = meas.weight || '';
    document.getElementById('measFat').value = meas.body_fat_percent || '';
    document.getElementById('measMuscle').value = meas.muscle_mass || '';
    document.getElementById('measChest').value = meas.chest || '';
    document.getElementById('measWaist').value = meas.waist || '';
    document.getElementById('measHips').value = meas.hips || '';
    document.getElementById('measHeartRate').value = meas.heart_rate || '';
    document.getElementById('measBpSystolic').value = meas.blood_pressure_systolic || '';
    document.getElementById('measBpDiastolic').value = meas.blood_pressure_diastolic || '';
    document.getElementById('measNotes').value = meas.notes || '';
    showModal('measurementModal');
}

async function deleteMeasurement(id) {
    if (!confirm('Удалить измерение?')) return;
    await fetchJSON(`/api/biometric_measurements/delete/${id}`, { method: 'DELETE' });
    await loadMeasurements();
}

async function loadActivities() {
    const data = await fetchJSON('/api/biometric_physical_activity/list?order_by=date DESC');
    renderActivitiesTable(data.data);
}

function renderActivitiesTable(activities) {
    const tbody = document.querySelector('#activitiesTable tbody');
    tbody.innerHTML = '';
    activities.forEach(a => {
        const row = tbody.insertRow();
        row.insertCell().textContent = a.date;
        row.insertCell().textContent = a.activity_type;
        row.insertCell().textContent = a.duration_minutes;
        row.insertCell().textContent = a.intensity || '';
        row.insertCell().textContent = a.notes || '';
        const actions = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.onclick = () => editActivity(a);
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.onclick = () => deleteActivity(a.id);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
    });
}

async function saveActivity(activity) {
    const id = activity.id || null;
    const url = id ? `/api/biometric_physical_activity/update/${id}` : '/api/biometric_physical_activity/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(activity) });
    await loadActivities();
    closeModal('activityModal');
}

function editActivity(act) {
    document.getElementById('activityId').value = act.id;
    document.getElementById('actDate').value = act.date;
    document.getElementById('actType').value = act.activity_type;
    document.getElementById('actDuration').value = act.duration_minutes;
    document.getElementById('actIntensity').value = act.intensity || '';
    document.getElementById('actNotes').value = act.notes || '';
    showModal('activityModal');
}

async function deleteActivity(id) {
    if (!confirm('Удалить запись о физической активности?')) return;
    await fetchJSON(`/api/biometric_physical_activity/delete/${id}`, { method: 'DELETE' });
    await loadActivities();
}

// ========== Ментальные показатели ==========
async function loadMentalEntries() {
    const data = await fetchJSON('/api/biometric_mental_daily/list?order_by=date DESC');
    renderMentalTable(data.data);
}

function renderMentalTable(entries) {
    const tbody = document.querySelector('#mentalTable tbody');
    tbody.innerHTML = '';
    entries.forEach(e => {
        const row = tbody.insertRow();
        row.insertCell().textContent = e.date;
        row.insertCell().textContent = e.focus || '';
        row.insertCell().textContent = e.attention || '';
        row.insertCell().textContent = e.thinking_speed || '';
        row.insertCell().textContent = e.energy || '';
        row.insertCell().textContent = e.mood || '';
        row.insertCell().textContent = e.thinking_type || '';
        row.insertCell().textContent = e.notes || '';
        const actions = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.onclick = () => editMentalEntry(e);
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.onclick = () => deleteMentalEntry(e.id);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
    });
}

async function saveMentalEntry(entry) {
    const id = entry.id || null;
    const url = id ? `/api/biometric_mental_daily/update/${id}` : '/api/biometric_mental_daily/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    await loadMentalEntries();
    closeModal('mentalModal');
}

function editMentalEntry(entry) {
    document.getElementById('mentalId').value = entry.id;
    document.getElementById('mentalDate').value = entry.date;
    document.getElementById('mentalFocus').value = entry.focus || '';
    document.getElementById('mentalAttention').value = entry.attention || '';
    document.getElementById('mentalThinkingSpeed').value = entry.thinking_speed || '';
    document.getElementById('mentalEnergy').value = entry.energy || '';
    document.getElementById('mentalMood').value = entry.mood || '';
    document.getElementById('mentalThinkingType').value = entry.thinking_type || '';
    document.getElementById('mentalNotes').value = entry.notes || '';
    showModal('mentalModal');
}

async function deleteMentalEntry(id) {
    if (!confirm('Удалить запись о ментальных показателях?')) return;
    await fetchJSON(`/api/biometric_mental_daily/delete/${id}`, { method: 'DELETE' });
    await loadMentalEntries();
}

// ========== Когнитивные тесты ==========
async function loadCognitiveTests() {
    const data = await fetchJSON('/api/biometric_cognitive_tests/list?order_by=date DESC');
    renderCognitiveTable(data.data);
}

function renderCognitiveTable(tests) {
    const tbody = document.querySelector('#cognitiveTable tbody');
    tbody.innerHTML = '';
    tests.forEach(t => {
        const row = tbody.insertRow();
        row.insertCell().textContent = t.date;
        row.insertCell().textContent = t.test_name;
        row.insertCell().textContent = t.score;
        row.insertCell().textContent = t.notes || '';
        const actions = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.onclick = () => editCognitiveTest(t);
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.onclick = () => deleteCognitiveTest(t.id);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
    });
}

async function saveCognitiveTest(test) {
    const id = test.id || null;
    const url = id ? `/api/biometric_cognitive_tests/update/${id}` : '/api/biometric_cognitive_tests/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(test) });
    await loadCognitiveTests();
    closeModal('testModal');
}

function editCognitiveTest(test) {
    document.getElementById('testId').value = test.id;
    document.getElementById('testDate').value = test.date;
    document.getElementById('testName').value = test.test_name;
    document.getElementById('testScore').value = test.score;
    document.getElementById('testNotes').value = test.notes || '';
    showModal('testModal');
}

async function deleteCognitiveTest(id) {
    if (!confirm('Удалить результат теста?')) return;
    await fetchJSON(`/api/biometric_cognitive_tests/delete/${id}`, { method: 'DELETE' });
    await loadCognitiveTests();
}

// ========== Инициализация ==========
document.addEventListener('DOMContentLoaded', () => {
    // Переключение вкладок
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.getElementById(`${tabId}Tab`).classList.add('active');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Загружаем данные для активной вкладки
            if (tabId === 'substances') {
                loadSubstances();
                loadIntakeLog();
            } else if (tabId === 'meals') {
                loadMeals();
            } else if (tabId === 'physical') {
                loadMeasurements();
                loadActivities();
            } else if (tabId === 'mental') {
                loadMentalEntries();
            } else if (tabId === 'cognitive') {
                loadCognitiveTests();
            }
        });
    });

    // Кнопки добавления
    document.getElementById('addSubstanceBtn').onclick = () => {
        document.getElementById('substanceId').value = '';
        document.getElementById('substanceName').value = '';
        document.getElementById('substanceDosage').value = '';
        document.getElementById('substanceFrequency').value = '';
        document.getElementById('substanceTime').value = '';
        showModal('substanceModal');
    };
    document.getElementById('addMealBtn').onclick = () => {
        document.getElementById('mealId').value = '';
        document.getElementById('mealDate').value = getTodayISO();
        document.getElementById('mealType').value = 'breakfast';
        document.getElementById('mealDesc').value = '';
        document.getElementById('mealCalories').value = '';
        document.getElementById('mealNotes').value = '';
        showModal('mealModal');
    };
    document.getElementById('addMeasurementBtn').onclick = () => {
        document.getElementById('measurementId').value = '';
        document.getElementById('measDate').value = getTodayISO();
        document.getElementById('measWeight').value = '';
        document.getElementById('measFat').value = '';
        document.getElementById('measMuscle').value = '';
        document.getElementById('measChest').value = '';
        document.getElementById('measWaist').value = '';
        document.getElementById('measHips').value = '';
        document.getElementById('measHeartRate').value = '';
        document.getElementById('measBpSystolic').value = '';
        document.getElementById('measBpDiastolic').value = '';
        document.getElementById('measNotes').value = '';
        showModal('measurementModal');
    };
    document.getElementById('addActivityBtn').onclick = () => {
        document.getElementById('activityId').value = '';
        document.getElementById('actDate').value = getTodayISO();
        document.getElementById('actType').value = '';
        document.getElementById('actDuration').value = '';
        document.getElementById('actIntensity').value = '';
        document.getElementById('actNotes').value = '';
        showModal('activityModal');
    };
    document.getElementById('addMentalEntryBtn').onclick = () => {
        document.getElementById('mentalId').value = '';
        document.getElementById('mentalDate').value = getTodayISO();
        document.getElementById('mentalFocus').value = '';
        document.getElementById('mentalAttention').value = '';
        document.getElementById('mentalThinkingSpeed').value = '';
        document.getElementById('mentalEnergy').value = '';
        document.getElementById('mentalMood').value = '';
        document.getElementById('mentalThinkingType').value = '';
        document.getElementById('mentalNotes').value = '';
        showModal('mentalModal');
    };
    document.getElementById('addTestBtn').onclick = () => {
        document.getElementById('testId').value = '';
        document.getElementById('testDate').value = getTodayISO();
        document.getElementById('testName').value = '';
        document.getElementById('testScore').value = '';
        document.getElementById('testNotes').value = '';
        showModal('testModal');
    };

    // Формы сохранения
    document.getElementById('substanceForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const substance = {
            name: document.getElementById('substanceName').value,
            dosage: document.getElementById('substanceDosage').value,
            frequency: document.getElementById('substanceFrequency').value,
            time_of_day: document.getElementById('substanceTime').value
        };
        const id = document.getElementById('substanceId').value;
        if (id) substance.id = parseInt(id);
        await saveSubstance(substance);
    });
    document.getElementById('mealForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const meal = {
            date: document.getElementById('mealDate').value,
            meal_type: document.getElementById('mealType').value,
            description: document.getElementById('mealDesc').value,
            calories: parseFloat(document.getElementById('mealCalories').value) || null,
            notes: document.getElementById('mealNotes').value
        };
        const id = document.getElementById('mealId').value;
        if (id) meal.id = parseInt(id);
        await saveMeal(meal);
    });
    document.getElementById('measurementForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const measurement = {
            date: document.getElementById('measDate').value,
            weight: parseFloat(document.getElementById('measWeight').value) || null,
            body_fat_percent: parseFloat(document.getElementById('measFat').value) || null,
            muscle_mass: parseFloat(document.getElementById('measMuscle').value) || null,
            chest: parseFloat(document.getElementById('measChest').value) || null,
            waist: parseFloat(document.getElementById('measWaist').value) || null,
            hips: parseFloat(document.getElementById('measHips').value) || null,
            heart_rate: parseInt(document.getElementById('measHeartRate').value) || null,
            blood_pressure_systolic: parseInt(document.getElementById('measBpSystolic').value) || null,
            blood_pressure_diastolic: parseInt(document.getElementById('measBpDiastolic').value) || null,
            notes: document.getElementById('measNotes').value
        };
        const id = document.getElementById('measurementId').value;
        if (id) measurement.id = parseInt(id);
        await saveMeasurement(measurement);
    });
    document.getElementById('activityForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const activity = {
            date: document.getElementById('actDate').value,
            activity_type: document.getElementById('actType').value,
            duration_minutes: parseInt(document.getElementById('actDuration').value),
            intensity: parseInt(document.getElementById('actIntensity').value) || null,
            notes: document.getElementById('actNotes').value
        };
        const id = document.getElementById('activityId').value;
        if (id) activity.id = parseInt(id);
        await saveActivity(activity);
    });
    document.getElementById('mentalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const entry = {
            date: document.getElementById('mentalDate').value,
            focus: parseInt(document.getElementById('mentalFocus').value) || null,
            attention: parseInt(document.getElementById('mentalAttention').value) || null,
            thinking_speed: parseInt(document.getElementById('mentalThinkingSpeed').value) || null,
            energy: parseInt(document.getElementById('mentalEnergy').value) || null,
            mood: parseInt(document.getElementById('mentalMood').value) || null,
            thinking_type: document.getElementById('mentalThinkingType').value,
            notes: document.getElementById('mentalNotes').value
        };
        const id = document.getElementById('mentalId').value;
        if (id) entry.id = parseInt(id);
        await saveMentalEntry(entry);
    });
    document.getElementById('testForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const test = {
            date: document.getElementById('testDate').value,
            test_name: document.getElementById('testName').value,
            score: parseFloat(document.getElementById('testScore').value),
            notes: document.getElementById('testNotes').value
        };
        const id = document.getElementById('testId').value;
        if (id) test.id = parseInt(id);
        await saveCognitiveTest(test);
    });

    // Закрытие модальных окон
    document.querySelectorAll('.close, .closeModalBtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) e.target.style.display = 'none';
    };

    // Загружаем начальную вкладку
    loadSubstances();
    loadIntakeLog();
});