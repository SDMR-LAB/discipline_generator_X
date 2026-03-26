console.log('[ideas.js] loaded');

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  return r.json();
}

// Вспомогательная функция: гарантированно возвращает массив связанных ID
function getRelatedIds(idea) {
  if (!idea) return [];
  const raw = idea.related_ids;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to parse related_ids', e);
      return [];
    }
  }
  return [];
}

let currentIdea = null;
let ideasList = [];

async function loadIdeas() {
  try {
    const res = await fetchJSON('/api/ideas');
    if (res.status === 'success') {
      ideasList = res.data;
      // Обновляем currentIdea, если он есть в списке
      if (currentIdea) {
        const updated = ideasList.find(i => i.id === currentIdea.id);
        if (updated) {
          currentIdea = updated;
          currentIdea.related_ids = getRelatedIds(currentIdea);
        } else {
          currentIdea = null;
          document.getElementById('ideaDetail').style.display = 'none';
        }
      }
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

  const currentRelatedIds = currentIdea ? getRelatedIds(currentIdea) : [];

  ideas.forEach(idea => {
    const li = document.createElement('li');
    if (idea.is_completed) li.classList.add('completed');
    if (currentIdea && currentRelatedIds.includes(idea.id) && idea.id !== currentIdea.id) {
      li.style.backgroundColor = '#ffeedd';
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
    const container = document.getElementById('relatedCheckboxes');
    container.innerHTML = '';
    res.data.forEach(idea => {
      if (currentIdea && idea.id === currentIdea.id) return;
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
  currentIdea.related_ids = getRelatedIds(currentIdea);

  const detailDiv = document.getElementById('ideaDetail');
  if (detailDiv) detailDiv.style.display = 'block';

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  setValue('detailTitle', currentIdea.title || '');
  setValue('detailDescription', currentIdea.description || '');
  setValue('detailRealism', currentIdea.realism || 5);

  const typeOwn = document.getElementById('typeOwn');
  const typeObservation = document.getElementById('typeObservation');
  const sourceInput = document.getElementById('detailSource');
  if (typeOwn && typeObservation && sourceInput) {
    if (currentIdea.idea_type === 'observation') {
      typeObservation.checked = true;
      sourceInput.disabled = false;
    } else {
      typeOwn.checked = true;
      sourceInput.disabled = true;
    }
    setValue('detailSource', currentIdea.source || '');
  }

  setValue('detailProblems', currentIdea.problems || '');
  setValue('detailWhatChanges', currentIdea.what_changes || '');
  setValue('detailDifficulty', currentIdea.difficulty || 'background');

  setValue('dI', currentIdea.i || 0);
  setValue('dS', currentIdea.s || 0);
  setValue('dW', currentIdea.w || 0);
  setValue('dE', currentIdea.e || 0);
  setValue('dC', currentIdea.c || 0);
  setValue('dH', currentIdea.h || 0);
  setValue('dST', currentIdea.st || 0);
  setValue('d$', currentIdea.money || 0);

  renderIdeas(ideasList); // обновляем подсветку

  const related = getRelatedIds(currentIdea);
  renderRelatedCheckboxes(related);
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

  const checkboxes = document.querySelectorAll('#relatedCheckboxes input[type=checkbox]:checked');
  const relatedIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));

  const payload = {
    title,
    description,
    realism,
    related_ids: relatedIds,
    idea_type: ideaType,
    source,
    problems,
    what_changes: whatChanges,
    difficulty,
    i: parseFloat(document.getElementById('dI').value) || 0,
    s: parseFloat(document.getElementById('dS').value) || 0,
    w: parseFloat(document.getElementById('dW').value) || 0,
    e: parseFloat(document.getElementById('dE').value) || 0,
    c: parseFloat(document.getElementById('dC').value) || 0,
    h: parseFloat(document.getElementById('dH').value) || 0,
    st: parseFloat(document.getElementById('dST').value) || 0,
    money: parseFloat(document.getElementById('d$').value) || 0
  };

  const resp = await fetchJSON(`/api/ideas/${currentIdea.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (resp.status === 'success') {
    const oldRelated = getRelatedIds(currentIdea);
    const newRelated = payload.related_ids || [];
    const added = newRelated.filter(id => !oldRelated.includes(id));
    const removed = oldRelated.filter(id => !newRelated.includes(id));

    async function updateIdeaRelated(ideaId, operation, targetId) {
      try {
        const getResp = await fetchJSON(`/api/ideas/${ideaId}`);
        if (getResp.status !== 'success') return false;
        const otherIdea = getResp.data;
        let rel = getRelatedIds(otherIdea);
        if (operation === 'add') {
          if (!rel.includes(targetId)) rel.push(targetId);
        } else if (operation === 'remove') {
          rel = rel.filter(id => id !== targetId);
        }
        const updResp = await fetchJSON(`/api/ideas/${ideaId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ related_ids: rel })
        });
        return updResp.status === 'success';
      } catch (e) {
        console.error('updateIdeaRelated error', e);
        return false;
      }
    }

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

    await loadIdeas();
    const fresh = ideasList.find(i => i.id === currentIdea.id);
    if (fresh) {
      currentIdea = fresh;
      currentIdea.related_ids = getRelatedIds(currentIdea);
    }
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

(async () => {
  await loadIdeas();

  document.getElementById('addIdeaBtn').onclick = addIdea;
  document.getElementById('saveDetailBtn').onclick = saveIdea;
  document.getElementById('deleteBtn').onclick = () => { if (currentIdea) deleteIdea(currentIdea); };
  document.getElementById('markDoneBtn').onclick = markDone;

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