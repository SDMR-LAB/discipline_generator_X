console.log('[ideas.js] loaded');

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  return r.json();
}

async function ensureIdeasProject() {
  const res = await fetchJSON('/api/planner/projects');
  if (res.status === 'success') {
    if (!res.data.includes('ideas')) {
      await fetch('/api/planner/create_project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ideas' })
      });
    }
  }
}

let currentIdea = null;
let allIdeas = [];          // для чекбоксов связей
let ideasList = [];          // <-- глобальный список всех идей

async function loadIdeas() {
  try {
    const res = await fetchJSON('/api/ideas');
    if (res.status === 'success') {
      ideasList = res.data;   // сохраняем
      renderIdeas(ideasList);
    } else {
      alert('Не удалось загрузить идеи: ' + (res.message || ''));
    }
  } catch (e) {
    console.error('[ideas] loadIdeas error', e);
    alert('Не удалось загрузить идеи (см. консоль)');
  }
}

function renderIdeas(ideas) {
  const ul = document.getElementById('ideasList');
  ul.innerHTML = '';

  let currentRelatedIds = [];
  if (currentIdea) {
    try {
      currentRelatedIds = JSON.parse(currentIdea.related_ids || '[]');
    } catch (e) {}
  }

  ideas.forEach(idea => {
    const li = document.createElement('li');
    if (idea.is_completed) li.classList.add('completed');
    // Подсветка связанных идей
    if (currentIdea && currentRelatedIds.includes(idea.id) && idea.id !== currentIdea.id) {
      li.style.backgroundColor = '#ffeedd'; // оранжеватый
    }

    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = idea.title;

    const realismSpan = document.createElement('span');
    realismSpan.className = 'realism-badge';
    realismSpan.textContent = `Р: ${idea.realism}`;

    const controlsDiv = document.createElement('div');
    controlsDiv.style.display = 'flex';
    controlsDiv.appendChild(realismSpan);

    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑️';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteIdea(idea); };

    controlsDiv.appendChild(delBtn);
    li.appendChild(titleSpan);
    li.appendChild(controlsDiv);
    li.onclick = () => selectIdea(idea);
    ul.appendChild(li);
  });
}

async function renderRelatedCheckboxes(selectedIds = []) {
  const res = await fetchJSON('/api/ideas/related');
  if (res.status === 'success') {
    allIdeas = res.data;
    const container = document.getElementById('relatedCheckboxes');
    container.innerHTML = '';
    allIdeas.forEach(idea => {
      if (currentIdea && idea.id === currentIdea.id) return; // исключаем себя
      const label = document.createElement('label');
      label.style.display = 'block';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = idea.id;
      cb.checked = selectedIds.includes(idea.id);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + idea.title));
      container.appendChild(label);
    });
  }
}

function selectIdea(idea) {
  currentIdea = idea;
  
  const detailDiv = document.getElementById('ideaDetail');
  if (!detailDiv) {
    console.error('ideaDetail not found');
    return;
  }
  detailDiv.style.display = 'block';

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.value = value;
    } else {
      console.error(`Element #${id} not found`);
    }
  }

  setValue('detailTitle', idea.title || '');
  setValue('detailDescription', idea.description || '');
  setValue('detailRealism', idea.realism || 5);

  // Тип идеи
  const typeOwn = document.getElementById('typeOwn');
  const typeObservation = document.getElementById('typeObservation');
  const sourceInput = document.getElementById('detailSource');
  
  if (typeOwn && typeObservation && sourceInput) {
    if (idea.idea_type === 'observation') {
      typeObservation.checked = true;
      sourceInput.disabled = false;
    } else {
      typeOwn.checked = true;
      sourceInput.disabled = true;
    }
    setValue('detailSource', idea.source || '');
  } else {
    console.error('Radio buttons or source input not found');
  }

  setValue('detailProblems', idea.problems || '');
  setValue('detailWhatChanges', idea.what_changes || '');
  setValue('detailDifficulty', idea.difficulty || 'background');

  // Характеристики
  setValue('dI', idea.i || 0);
  setValue('dS', idea.s || 0);
  setValue('dW', idea.w || 0);
  setValue('dE', idea.e || 0);
  setValue('dC', idea.c || 0);
  setValue('dH', idea.h || 0);
  setValue('dST', idea.st || 0);
  setValue('d$', idea.money || 0);

  renderIdeas(ideasList); 

  // Загружаем чекбоксы связей
  let related = [];
  try {
    related = JSON.parse(idea.related_ids || '[]');
  } catch (e) {}
  renderRelatedCheckboxes(related);
}

// Вспомогательная функция для обновления связей у другой идеи
async function updateIdeaRelated(ideaId, operation, targetId) {
  try {
    // получаем данные идеи
    const getResp = await fetchJSON(`/api/ideas/${ideaId}`);
    if (getResp.status !== 'success') {
      console.error('Cannot fetch idea', ideaId);
      return false;
    }
    const idea = getResp.data;
    let related = [];
    try {
      related = JSON.parse(idea.related_ids || '[]');
    } catch (e) {}
    if (operation === 'add') {
      if (!related.includes(targetId)) related.push(targetId);
    } else if (operation === 'remove') {
      related = related.filter(id => id !== targetId);
    }
    const updateResp = await fetchJSON(`/api/ideas/${ideaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ related_ids: related })
    });
    return updateResp.status === 'success';
  } catch (e) {
    console.error('updateIdeaRelated error', e);
    return false;
  }
}

async function deleteIdea(idea) {
  if (!confirm('Удалить идею?')) return;
  const resp = await fetchJSON(`/api/ideas/${idea.id}`, { method: 'DELETE' });
  if (resp.status === 'success') {
    await loadIdeas();
    document.getElementById('ideaDetail').style.display = 'none';
    currentIdea = null;
  } else {
    alert('Ошибка удаления');
  }
}

async function saveIdea() {
  if (!currentIdea) return;
  const title = document.getElementById('detailTitle').value.trim();
  if (!title) return alert('Название не может быть пустым');

  const ideaType = document.querySelector('input[name="ideaType"]:checked').value;
  const source = document.getElementById('detailSource').value;
  const problems = document.getElementById('detailProblems').value;
  const whatChanges = document.getElementById('detailWhatChanges').value;
  const difficulty = document.getElementById('detailDifficulty').value;
  const description = document.getElementById('detailDescription').value;
  const realism = parseInt(document.getElementById('detailRealism').value, 10) || 5;

  // Собираем ID выбранных связанных идей из чекбоксов
  const checkboxes = document.querySelectorAll('#relatedCheckboxes input[type=checkbox]:checked');
  const relatedIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));

  const payload = {
    title,
    description,
    realism,
    related_ids: relatedIds,
    idea_type: ideaType,
    source: source,
    problems: problems,
    what_changes: whatChanges,
    difficulty: difficulty,
    i: parseFloat(document.getElementById('dI').value) || 0,
    s: parseFloat(document.getElementById('dS').value) || 0,
    w: parseFloat(document.getElementById('dW').value) || 0,
    e: parseFloat(document.getElementById('dE').value) || 0,
    c: parseFloat(document.getElementById('dC').value) || 0,
    h: parseFloat(document.getElementById('dH').value) || 0,
    st: parseFloat(document.getElementById('dST').value) || 0,
    money: parseFloat(document.getElementById('d$').value) || 0
  };
  console.log('Saving idea payload:', payload);

  const resp = await fetchJSON(`/api/ideas/${currentIdea.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (resp.status === 'success') {
    // Двунаправленное обновление связей
    const oldRelated = currentIdea.related_ids ? JSON.parse(currentIdea.related_ids) : [];
    const newRelated = payload.related_ids || [];
    const added = newRelated.filter(id => !oldRelated.includes(id));
    const removed = oldRelated.filter(id => !newRelated.includes(id));

    let allSuccess = true;
    for (const id of added) {
      const ok = await updateIdeaRelated(id, 'add', currentIdea.id);
      if (!ok) allSuccess = false;
    }
    for (const id of removed) {
      const ok = await updateIdeaRelated(id, 'remove', currentIdea.id);
      if (!ok) allSuccess = false;
    }

    if (!allSuccess) {
      alert('Некоторые связи не удалось обновить. Проверьте данные вручную.');
    }

    await loadIdeas();            // перезагружаем список
    currentIdea = { ...currentIdea, ...payload };
  } else {
    alert('Ошибка сохранения');
  }
}

async function markDone() {
  if (!currentIdea) return;
  const deltas = {
    I: parseFloat(document.getElementById('dI').value) || 0,
    S: parseFloat(document.getElementById('dS').value) || 0,
    W: parseFloat(document.getElementById('dW').value) || 0,
    E: parseFloat(document.getElementById('dE').value) || 0,
    C: parseFloat(document.getElementById('dC').value) || 0,
    H: parseFloat(document.getElementById('dH').value) || 0,
    ST: parseFloat(document.getElementById('dST').value) || 0,
    $: parseFloat(document.getElementById('d$').value) || 0
  };

  const resp = await fetchJSON(`/api/ideas/${currentIdea.id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deltas })
  });

  if (resp.status === 'success') {
    await loadIdeas();
    document.getElementById('ideaDetail').style.display = 'none';
    currentIdea = null;
  } else {
    alert('Ошибка отметки выполнения');
  }
}

async function addIdea() {
  const title = document.getElementById('newIdeaTitle').value.trim();
  if (!title) return alert('Введите название идеи');

  const resp = await fetchJSON('/api/ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description: '' })
  });

  if (resp.status === 'success') {
    document.getElementById('newIdeaTitle').value = '';
    await loadIdeas();
  } else {
    alert('Ошибка создания: ' + (resp.message || ''));
  }
}

console.log('[ideas] script init');
(async () => {
  await ensureIdeasProject();
  await loadIdeas();

  document.getElementById('addIdeaBtn').onclick = addIdea;
  document.getElementById('saveDetailBtn').onclick = saveIdea;
  document.getElementById('deleteBtn').onclick = () => { if (currentIdea) deleteIdea(currentIdea); };
  document.getElementById('markDoneBtn').onclick = markDone;

  // Обработчики для блокировки поля источника
  document.getElementById('typeObservation').addEventListener('change', function(e) {
    document.getElementById('detailSource').disabled = !e.target.checked;
  });
  document.getElementById('typeOwn').addEventListener('change', function(e) {
    if (e.target.checked) {
      document.getElementById('detailSource').disabled = true;
      document.getElementById('detailSource').value = '';
    }
  });
})();