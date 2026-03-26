console.log('[planner.js] loaded');

let currentProject = null;

async function fetchJSON(url, opts){
  const r = await fetch(url, opts);
  return r.json();
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`Сервер вернул не JSON: ${text.slice(0, 200)}`);
  }

  if (!r.ok) {
    throw new Error(data.message || `HTTP ${r.status}`);
  }

  return data;
}

async function loadProjects() {
  try {
    const res = await fetchJSON('/api/planner/projects');

    if (res.status === 'success') {
      renderProjects(res.data || []);

      if (currentProject) {
        const stillExists = (res.data || []).includes(currentProject);
        if (stillExists) {
          await loadProject(currentProject);
        } else {
          currentProject = null;
          const title = document.getElementById('projectTitle');
          if (title) title.textContent = 'Выберите проект';
        }
      }
    } else {
      alert('Ошибка загрузки проектов: ' + (res.message || ''));
    }
  } catch (e) {
    console.error('loadProjects error:', e);
    alert('Ошибка загрузки проектов. См. консоль.');
  }
}

function renderProjects(list, activeName = currentProject){
  const el = document.getElementById('projectsList');
  el.innerHTML = '';
  list.forEach(p=>{
    const li = document.createElement('li');
    const isTraining = p.startsWith('!');
    const displayName = isTraining ? p.slice(1) : p;
    if(isTraining) li.classList.add('training');

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = isTraining;
    chk.title = 'Отметить как обучающий проект';
    chk.style.marginRight = '8px';
    chk.onclick = async (ev)=>{
      ev.stopPropagation();
      const resp = await fetch('/api/planner/toggle_training', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ project: p }) });
      const data = await resp.json();
      if(data.status === 'success'){
        currentProject = data.new_name;
        await loadProjects();
      } else {
        alert('Ошибка переключения проекта: '+(data.message||''));
      }
    };

    const nameSpan = document.createElement('span');
    nameSpan.textContent = displayName;
    nameSpan.style.cursor = 'pointer';
    nameSpan.style.flex = '1';

    li.style.cursor = 'pointer';
    li.onclick = (e) => {
      if (e.target !== chk) {
        loadProject(p);
      }
    };

    li.appendChild(chk);
    li.appendChild(nameSpan);
    el.appendChild(li);

    if (activeName === p) {
      li.classList.add('active');
    }
  });
}

document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'createProjectBtn'){
    const name = document.getElementById('newProjectName').value.trim();
    if(!name){ alert('Введите имя папки'); return; }
    fetch('/api/planner/create_project', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) })
      .then(r=>r.json()).then(res=>{ if(res.status==='success'){ loadProjects(); document.getElementById('newProjectName').value=''; } else alert(res.message||'Ошибка'); })
  }
});

async function loadProject(name){
  console.log('loadProject called with', name);
  currentProject = name;
  document.getElementById('projectTitle').textContent = name;
  const res = await fetchJSON('/api/planner/project/'+encodeURIComponent(name));
  if(res.status !== 'success'){
    alert('Не удалось загрузить проект'); return;
  }
  renderRoadmap(name, res.data);
}

function renderRoadmap(project, tasks){
  console.log('renderRoadmap for', project, tasks.length);
  const col = document.getElementById('nodesCol');
  const svg = document.getElementById('roadmapSvg');
  const progressFill = document.getElementById('progressFill');
  col.innerHTML = '';
  svg.innerHTML = '';

  const isTrainingProject = project.startsWith('!');
  let perc = 0;
  if(isTrainingProject){
    const totalParts = tasks.length * 3 || 1;
    let gained = 0;
    tasks.forEach(t=>{
      const name = t.filename;
      const m = name.match(/(?:\s([x]+))(?:\s|\.|$)/);
      const xs = m ? (m[1] || '') : '';
      const count = Math.min(3, xs.length);
      gained += count;
    });
    perc = Math.round((gained / totalParts) * 100);
  } else {
    const total = tasks.length || 1;
    const done = tasks.filter(t=>t.completed).length;
    perc = Math.round((done/total)*100);
  }
  progressFill.style.width = perc + '%';
  const percEl = document.getElementById('progressPercent');
  if(percEl) percEl.textContent = perc + '%';

  tasks.forEach((t, i)=>{
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'flex-start';
    container.style.gap = '12px';
    container.style.marginBottom = '24px';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'node' + (t.completed? ' completed':'');
    wrapper.style.flexShrink = '0';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    
    const isTraining = project.startsWith('!');
    if(isTraining){
      const m = t.filename.match(/(?:\s([x]+))(?:\s|\.|$)/);
      const xs = m ? (m[1] || '') : '';
      const xcount = xs.length;
      if(xcount > 0 && xcount < 3){
        wrapper.classList.add('training');
        wrapper.classList.add('pending');
      } else if(xcount >= 3){
        wrapper.classList.add('training');
        wrapper.classList.add('completed');
      } else {
        wrapper.classList.add('training');
      }
    }

    wrapper.onclick = ()=>{ showDetail(project, t, wrapper); };

    const textSection = document.createElement('div');
    textSection.style.display = 'flex';
    textSection.style.flexDirection = 'column';
    textSection.style.justifyContent = 'flex-start';
    textSection.style.paddingTop = '2px';
    
    const title = document.createElement('div');
    title.className = 'title';
    let titleText = t.filename.replace(/\.[^/.]+$/, '');
    if(t.completed){
      const m = titleText.match(/^(.*?)\s(\d{4}-\d{2}-\d{2})\s[x]+\sвыполнено$/i);
      if(m){
        titleText = m[1] + ' (' + m[2] + ')';
      }
    }
    title.textContent = titleText;
    textSection.appendChild(title);

    container.appendChild(wrapper);
    container.appendChild(textSection);
    col.appendChild(container);
  });

  const nodesCol = document.getElementById('nodesCol');
  const nodes = nodesCol.querySelectorAll('.node');
  svg.innerHTML = '';
  
  if(nodes.length > 0){
    let minY = Infinity, maxY = -Infinity;
    const nodePos = [];
    
    nodes.forEach((node, i) => {
      const rect = node.getBoundingClientRect();
      const colRect = nodesCol.getBoundingClientRect();
      const relY = rect.top - colRect.top + nodesCol.scrollTop;
      const relX = rect.left - colRect.left + nodesCol.scrollLeft;
      const cy = relY + rect.height / 2;
      const cx = relX + rect.width / 2;
      
      nodePos.push({x: cx, y: cy});
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
    });
    
    const totalHeight = maxY - minY + 100;
    svg.setAttribute('height', Math.max(400, totalHeight));
    
    for(let i = 1; i < nodePos.length; i++){
      const a = nodePos[i-1];
      const b = nodePos[i];
      const line = document.createElementNS('http://www.w3.org/2000/svg','path');
      const d = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
      line.setAttribute('d', d);
      line.setAttribute('stroke', '#ddd');
      line.setAttribute('stroke-width', '3');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke-dasharray', '6,6');
      svg.appendChild(line);
    }
  }
}

function showDetail(project, task, nodeEl){
  document.querySelectorAll('.nodes-col .node').forEach(n=>n.classList.remove('active'));
  nodeEl.classList.add('active');
  document.getElementById('detailTitle').textContent = task.filename;
  
  let displayContent = task.content || '(пусто)';
  let repeatInfo = null;
  if(task.content) {
    const lines = task.content.split('\n');
    if(lines[0] && lines[0].includes('════')) {
      const repeatMatch = task.content.match(/Повтор:\s*(\d{4}-\d{2}-\d{2})/);
      if(repeatMatch) {
        repeatInfo = repeatMatch[1];
        let cleanContent = task.content.split('\n').slice(3).join('\n').trim();
        displayContent = cleanContent || '(пусто)';
      }
    }
  }
  
  let detailContentText = displayContent;
  if(repeatInfo) {
    detailContentText = `[Повтор: ${repeatInfo}]\n\n${displayContent}`;
  }
  
  document.getElementById('detailContent').textContent = detailContentText;
  document.getElementById('detailTextarea').value = displayContent;
  ['I','S','W','E','C','H','ST','$'].forEach(k=>{ const el = document.getElementById('d'+(k==='$'?'$':k)); if(el) el.value=''; });

  const applyBtn = document.getElementById('applyDeltasBtn');
  applyBtn.onclick = async ()=>{
    const deltas = {};
    ['I','S','W','E','C','H','ST','$'].forEach(k=>{ const el = document.getElementById('d'+(k==='$'?'$':k)); if(el && el.value) deltas[k]=parseFloat(el.value) || 0; });
    const resp = await fetchJSON('/api/planner/complete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ project, filename: task.filename, mark:true, deltas }) });
    if(resp.status === 'success'){
      await loadProject(project);
    } else {
      alert('Ошибка применения: '+(resp.message||''));
    }
  };

  document.getElementById('saveContentBtn').onclick = async ()=>{
    const content = document.getElementById('detailTextarea').value;
    const resp = await fetchJSON('/api/planner/task', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ project, filename: task.filename, content }) });
    if(resp.status === 'success'){
      await loadProject(project);
    } else alert('Ошибка сохранения: '+(resp.message||''));
  };

  document.getElementById('deleteTaskBtn').onclick = async ()=>{
    if(!confirm('Удалить задачу?')) return;
    const resp = await fetchJSON('/api/planner/task', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ project, filename: task.filename }) });
    if(resp.status === 'success'){
      await loadProject(project);
      document.getElementById('detailTitle').textContent = 'Детали';
      document.getElementById('detailTextarea').value = '';
      document.getElementById('detailContent').textContent = 'Выберите узел слева';
    } else alert('Ошибка удаления: '+(resp.message||''));
  };
}

async function createTaskInProject(project, filename, content){
  console.log(`Creating task: project=${project}, filename=${filename}, content length=${content.length}`);
  const resp = await fetchJSON('/api/planner/task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ project, filename, content }) });
  console.log('createTaskInProject response:', resp);
  return resp;
}

async function renameTask(project, oldFilename, newFilename) {
  const res = await fetchJSON('/api/planner/rename_task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, old_filename: oldFilename, new_filename: newFilename })
  });
  return res;
}

// Инициализация формы создания задач и обработчиков
function initCreateTaskForm() {
  const detailPanel = document.getElementById('detailPanel');
  if (!detailPanel) {
    console.warn('detailPanel not found');
    return;
  }

  // Если секция уже существует, не добавляем повторно
  let createSection = document.getElementById('createTaskSection');
  if (!createSection) {
    createSection = document.createElement('div');
    createSection.id = 'createTaskSection';
    createSection.style.marginTop = '20px';
    createSection.style.paddingTop = '12px';
    createSection.style.borderTop = '1px solid #eee';
    createSection.innerHTML = `
      <h4 style="margin:0 0 8px 0">Создать новую задачу</h4>
      <input id="newTaskNameInput" placeholder="Имя файла (например, task.txt)" style="width:100%; box-sizing:border-box; margin-bottom:6px" />
      <textarea id="newTaskContentInput" placeholder="Содержимое файла (опционально)" style="width:100%; height:100px; box-sizing:border-box; margin-bottom:6px"></textarea>
      <button id="createTaskBtn" style="width:100%">Создать задачу</button>
    `;
    detailPanel.appendChild(createSection);
  }

  // Привязываем обработчик к кнопке создания
  const createBtn = document.getElementById('createTaskBtn');
  if (createBtn) {
    // Убираем старый обработчик, чтобы не дублировать
    createBtn.onclick = async (e) => {
      e.preventDefault();

      const project = currentProject;
      if (!project || project === 'Выберите проект') {
        alert('Сначала выберите проект');
        return;
      }

      const filename = document.getElementById('newTaskNameInput').value.trim();
      if (!filename) {
        alert('Введите имя файла');
        return;
      }

      const content = document.getElementById('newTaskContentInput').value;

      try {
        const resp = await createTaskInProject(project, filename, content);
        if (resp.status === 'success') {
          document.getElementById('newTaskNameInput').value = '';
          document.getElementById('newTaskContentInput').value = '';
          await loadProject(project);
        } else {
          alert('Ошибка создания: ' + (resp.message || ''));
        }
      } catch (err) {
        console.error(err);
        alert('Ошибка создания: ' + err.message);
      }
    };
    console.log('Create button handler attached');
  } else {
    console.warn('createTaskBtn not found');
  }

  const newTaskButton = document.getElementById('newTaskButton');
  if (newTaskButton) {
    newTaskButton.onclick = () => {
      const section = document.getElementById('createTaskSection');
      const nameInput = document.getElementById('newTaskNameInput');

      if (!section || !nameInput) {
        alert('Форма создания задачи не найдена');
        return;
      }

      section.style.display = 'block';
      section.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameInput.focus();
    };
  }

  // Кнопка переименования
  if (!document.getElementById('renameTaskBtn')) {
    const renameBtn = document.createElement('button');
    renameBtn.id = 'renameTaskBtn';
    renameBtn.textContent = 'Переименовать';
    renameBtn.style.marginLeft = '8px';
    const titleEl = document.getElementById('detailTitle');
    if (titleEl) {
      titleEl.parentNode.insertBefore(renameBtn, titleEl.nextSibling);
    } else {
      detailPanel.insertBefore(renameBtn, detailPanel.firstChild);
    }
    renameBtn.onclick = async () => {
      const project = currentProject;
      const filenameElem = document.getElementById('detailTitle');
      if (!project || !filenameElem || filenameElem.textContent === 'Детали') {
        alert('Сначала выберите задачу');
        return;
      }
      const oldFilename = filenameElem.textContent;
      const newFilename = prompt('Введите новое имя файла:', oldFilename);
      if (!newFilename || newFilename === oldFilename) return;
      const resp = await renameTask(project, oldFilename, newFilename);
      if (resp.status === 'success') {
        await loadProject(project);
      } else {
        alert('Ошибка переименования: ' + (resp.message || ''));
      }
    };
  }
}

function initPlannerUI() {
  initCreateTaskForm();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlannerUI);
} else {
  initPlannerUI();
}
document.getElementById('refreshProjects').addEventListener('click', loadProjects);
console.log('[planner] script init, starting loadProjects');
loadProjects();