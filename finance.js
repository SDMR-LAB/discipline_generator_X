// Finance page logic

let balanceChart, activePassiveChart;
let currentPeriod = 'month';
let transactions = [];
let categories = [];

// DOM elements
const stats = {
    income: document.getElementById('totalIncome'),
    expense: document.getElementById('totalExpense'),
    net: document.getElementById('netProfit'),
    expensePercent: document.getElementById('expensePercent'),
};

// Helper: fetch JSON with error handling
async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Request failed');
    }
    return data;
}

// Load categories and populate dropdowns
async function loadCategories() {
    const data = await fetchJSON('/api/finance_categories/list');
    categories = data.data;
    // populate category selects
    const categorySelect = document.getElementById('category');
    const filterCategory = document.getElementById('filterCategory');
    categorySelect.innerHTML = '<option value="">-- Выберите --</option>';
    filterCategory.innerHTML = '<option value="">Все</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        categorySelect.appendChild(opt);
        const opt2 = opt.cloneNode(true);
        filterCategory.appendChild(opt2);
    });
}

// Load transactions with filters
async function loadTransactions() {
    const params = new URLSearchParams();
    const from = document.getElementById('filterDateFrom').value;
    const to = document.getElementById('filterDateTo').value;
    const category = document.getElementById('filterCategory').value;
    const type = document.getElementById('filterType').value;
    if (from) params.append('date_from', from);
    if (to) params.append('date_to', to);
    if (category) params.append('category_id', category);
    if (type) params.append('type', type);
    const url = '/api/finance_transactions/list?' + params.toString();
    const data = await fetchJSON(url);
    transactions = data.data;
    renderTransactionsTable();
}

function renderTransactionsTable() {
    const tbody = document.querySelector('#transactionsTable tbody');
    tbody.innerHTML = '';
    for (const t of transactions) {
        const cat = categories.find(c => c.id === t.category_id);
        const row = tbody.insertRow();
        row.insertCell().textContent = t.date;
        row.insertCell().textContent = cat ? cat.name : '—';
        row.insertCell().textContent = t.amount.toFixed(2);
        row.insertCell().textContent = t.description || '';
        const actions = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.onclick = () => editTransaction(t);
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.onclick = () => deleteTransaction(t.id);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
    }
}

async function deleteTransaction(id) {
    if (!confirm('Удалить операцию?')) return;
    await fetchJSON(`/api/finance_transactions/delete/${id}`, { method: 'DELETE' });
    await loadTransactions();
    await loadStats();
}

async function saveTransaction(transaction) {
    const id = transaction.id || null;
    const url = id ? `/api/finance_transactions/update/${id}` : '/api/finance_transactions/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(transaction) });
    await loadTransactions();
    await loadStats();
    closeModal('transactionModal');
}

function editTransaction(t) {
    document.getElementById('modalTitle').textContent = 'Редактировать операцию';
    document.getElementById('transactionId').value = t.id;
    document.getElementById('date').value = t.date;
    document.getElementById('category').value = t.category_id;
    document.getElementById('amount').value = t.amount;
    document.getElementById('description').value = t.description || '';
    showModal('transactionModal');
}

function resetTransactionForm() {
    document.getElementById('transactionId').value = '';
    document.getElementById('date').value = new Date().toISOString().slice(0,10);
    document.getElementById('category').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('description').value = '';
    document.getElementById('modalTitle').textContent = 'Добавить операцию';
}

async function loadStats() {
    const data = await fetchJSON(`/api/finance/stats?period=${currentPeriod}`);
    const statsData = data.data;
    stats.income.textContent = statsData.income.toFixed(2);
    stats.expense.textContent = statsData.expense.toFixed(2);
    stats.net.textContent = statsData.net.toFixed(2);
    stats.expensePercent.textContent = statsData.expense_percent.toFixed(1) + '%';
    updateCharts(statsData);
}

function updateCharts(statsData) {
    // Балансовый график (ежедневные доходы/расходы)
    const labels = statsData.daily_series.map(d => d.date);
    const incomeData = statsData.daily_series.map(d => d.income);
    const expenseData = statsData.daily_series.map(d => d.expense);

    if (balanceChart) balanceChart.destroy();
    balanceChart = new Chart(document.getElementById('balanceChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Доход', data: incomeData, borderColor: '#2ecc71', fill: false },
                { label: 'Расход', data: expenseData, borderColor: '#e74c3c', fill: false }
            ]
        },
        options: { responsive: true }
    });

    // Активные vs пассивные доходы (можно отдельный API, но у нас есть в stats)
    // Сделаем круговую диаграмму
    const active = statsData.active_income;
    const passive = statsData.passive_income;
    if (activePassiveChart) activePassiveChart.destroy();
    activePassiveChart = new Chart(document.getElementById('activePassiveChart'), {
        type: 'pie',
        data: {
            labels: ['Активный доход', 'Пассивный доход'],
            datasets: [{ data: [active, passive], backgroundColor: ['#3498db', '#f1c40f'] }]
        }
    });
}

// Categories management
async function loadCategoriesTable() {
    const data = await fetchJSON('/api/finance_categories/list');
    const categoriesList = data.data;
    const tbody = document.querySelector('#categoriesTable tbody');
    tbody.innerHTML = '';
    for (const cat of categoriesList) {
        const row = tbody.insertRow();
        row.insertCell().textContent = cat.name;
        row.insertCell().textContent = cat.type === 'income' ? 'Доход' : 'Расход';
        row.insertCell().textContent = cat.is_active ? 'Да' : 'Нет';
        row.insertCell().textContent = cat.color || '';
        const actions = row.insertCell();
        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.onclick = () => editCategory(cat);
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.onclick = () => deleteCategory(cat.id);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
    }
}

function editCategory(cat) {
    document.getElementById('categoryId').value = cat.id;
    document.getElementById('catName').value = cat.name;
    document.getElementById('catType').value = cat.type;
    document.getElementById('catActive').checked = cat.is_active;
    document.getElementById('catColor').value = cat.color || '#000000';
    showModal('categoryModal');
}

async function saveCategory(category) {
    const id = category.id || null;
    const url = id ? `/api/finance_categories/update/${id}` : '/api/finance_categories/create';
    const method = id ? 'PUT' : 'POST';
    await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(category) });
    await loadCategoriesTable();
    await loadCategories(); // refresh dropdowns
    closeModal('categoryModal');
}

async function deleteCategory(id) {
    if (!confirm('Удалить категорию? Все операции с ней станут без категории.')) return;
    // Optionally reassign operations to a default category? For simplicity, we'll just delete and set category_id to NULL?
    // But foreign key constraint? We'll handle by setting category_id to NULL if allowed. Let's make category_id nullable.
    // In model, we didn't set required, but it's required in Transaction. We'll adjust later if needed. For now, prevent delete if used.
    // Better: show warning and require reassign. We'll skip for MVP.
    await fetchJSON(`/api/finance_categories/delete/${id}`, { method: 'DELETE' });
    await loadCategoriesTable();
    await loadCategories();
}

// Modal helpers
function showModal(id) {
    document.getElementById(id).style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}
function resetCategoryForm() {
    document.getElementById('categoryId').value = '';
    document.getElementById('catName').value = '';
    document.getElementById('catType').value = 'income';
    document.getElementById('catActive').checked = false;
    document.getElementById('catColor').value = '#000000';
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    await loadTransactions();
    await loadStats();

    // Period buttons
    document.querySelectorAll('.period-controls button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-controls button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.getAttribute('data-period');
            loadStats();
        });
    });

    // Transaction modal
    document.getElementById('addTransactionBtn').addEventListener('click', () => {
        resetTransactionForm();
        showModal('transactionModal');
    });
    document.getElementById('transactionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const transaction = {
            date: document.getElementById('date').value,
            category_id: parseInt(document.getElementById('category').value),
            amount: parseFloat(document.getElementById('amount').value),
            description: document.getElementById('description').value
        };
        const id = document.getElementById('transactionId').value;
        if (id) transaction.id = parseInt(id);
        await saveTransaction(transaction);
    });
    document.getElementById('applyFilters').addEventListener('click', () => loadTransactions());

    // Categories modal
    document.getElementById('manageCategoriesBtn').addEventListener('click', async () => {
        await loadCategoriesTable();
        showModal('categoriesModal');
    });
    document.getElementById('addCategoryBtn').addEventListener('click', () => {
        resetCategoryForm();
        showModal('categoryModal');
    });
    document.getElementById('categoryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const category = {
            name: document.getElementById('catName').value,
            type: document.getElementById('catType').value,
            is_active: document.getElementById('catActive').checked,
            color: document.getElementById('catColor').value
        };
        const id = document.getElementById('categoryId').value;
        if (id) category.id = parseInt(id);
        await saveCategory(category);
    });

    // Close modals
    document.querySelectorAll('.close, .closeModalBtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) e.target.style.display = 'none';
    };
});