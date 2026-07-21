import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getFirestore, doc, setDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
  projectId: 'vysion-tdl',
  appId: '1:20229848862:web:a896cbb9531d3982c0d30f',
  storageBucket: 'vysion-tdl.firebasestorage.app',
  apiKey: 'AIzaSyATrJYs5Mga70Jp6B1X5V2bV6gKX14T2JA',
  authDomain: 'vysion-tdl.firebaseapp.com',
  messagingSenderId: '20229848862',
  measurementId: 'G-G7LC5L2MG5',
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const TASKS_KEY = 'pareto-todo-tasks-v2';
const LEGACY_TASKS_KEY = 'pareto-todo-tasks-v1';
const RECURRING_KEY = 'pareto-todo-recurring-v1';
const SYNC_CODE_KEY = 'pareto-todo-sync-code';
const PRIORITY_THRESHOLD = 8;
const MATERIALIZE_DAYS_AHEAD = 30;

const taskListEl = document.getElementById('taskList');
const emptyStateEl = document.getElementById('emptyState');
const listTitleEl = document.getElementById('listTitle');
const addForm = document.getElementById('addForm');
const titleInput = document.getElementById('taskTitle');
const weightInput = document.getElementById('taskWeight');
const weightValueEl = document.getElementById('weightValue');
const scoreValueEl = document.getElementById('scoreValue');
const scoreLabelEl = document.getElementById('scoreLabel');
const scoreBarFillEl = document.getElementById('scoreBarFill');
const scoreSubEl = document.getElementById('scoreSub');
const priorityWarningEl = document.getElementById('priorityWarning');
const prevDayBtn = document.getElementById('prevDayBtn');
const nextDayBtn = document.getElementById('nextDayBtn');
const dayRelativeEl = document.getElementById('dayRelative');
const dateJumpInput = document.getElementById('dateJump');
const todayBtn = document.getElementById('todayBtn');
const repeatModeSelect = document.getElementById('repeatMode');
const weekdayPicker = document.getElementById('weekdayPicker');
const datePickerRow = document.getElementById('datePickerRow');
const dayChipsEl = document.getElementById('dayChips');
const otherDateToggle = document.getElementById('otherDateToggle');
const taskDateInput = document.getElementById('taskDate');
const recurringWrap = document.getElementById('recurringWrap');
const recurringListEl = document.getElementById('recurringList');
const upcomingWrap = document.getElementById('upcomingWrap');
const upcomingList = document.getElementById('upcomingList');
const historyWrap = document.getElementById('historyWrap');
const historyList = document.getElementById('historyList');
const syncInactiveEl = document.getElementById('syncInactive');
const syncActiveEl = document.getElementById('syncActive');
const createSyncBtn = document.getElementById('createSyncBtn');
const joinSyncInput = document.getElementById('joinSyncInput');
const joinSyncBtn = document.getElementById('joinSyncBtn');
const syncCodeDisplay = document.getElementById('syncCodeDisplay');
const copySyncBtn = document.getElementById('copySyncBtn');
const disableSyncBtn = document.getElementById('disableSyncBtn');
const syncStatusEl = document.getElementById('syncStatus');

function pad(n) { return String(n).padStart(2, '0'); }

function formatKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayKey() {
  return formatKey(new Date());
}

function addDaysToKey(key, delta) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + delta);
  return formatKey(d);
}

function daysBetween(fromKey, toKey) {
  return Math.round((keyToDate(toKey) - keyToDate(fromKey)) / 86400000);
}

function longLabel(key) {
  const label = keyToDate(key).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shortLabel(key) {
  const label = keyToDate(key).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function relativeLabel(key) {
  const diff = daysBetween(todayKey(), key);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  return null;
}

function chipLabel(key) {
  const rel = relativeLabel(key);
  if (rel) return rel;
  const d = keyToDate(key);
  const wd = d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d.getDate()}`;
}

function weekdayPatternLabel(days) {
  if (days.length === 7) return 'Tous les jours';
  const names = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => names[d]).join(', ');
}

function loadTasks() {
  let loaded = null;
  try {
    loaded = JSON.parse(localStorage.getItem(TASKS_KEY));
  } catch {
    loaded = null;
  }
  if (!loaded) {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_TASKS_KEY)) || [];
      loaded = legacy.map(t => ({ ...t, date: todayKey() }));
      localStorage.setItem(TASKS_KEY, JSON.stringify(loaded));
      localStorage.removeItem(LEGACY_TASKS_KEY);
    } catch {
      loaded = [];
    }
  }
  loaded.forEach(t => {
    if (!('originalDate' in t)) t.originalDate = t.date;
    if (!('recurringId' in t)) t.recurringId = null;
  });
  return loaded;
}

function saveTasks() {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  pushToCloud();
}

function loadRecurringTasks() {
  try {
    return JSON.parse(localStorage.getItem(RECURRING_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecurringTasks() {
  localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringTasks));
  pushToCloud();
}

let tasks = loadTasks();
let recurringTasks = loadRecurringTasks();
let selectedDate = todayKey();
let selectedTaskDate = todayKey();
const selectedWeekdays = new Set();

let syncCode = localStorage.getItem(SYNC_CODE_KEY) || null;
let syncUnsubscribe = null;
let lastSyncedAt = null;

function pushToCloud() {
  if (!syncCode) return;
  const updatedAt = Date.now();
  lastSyncedAt = updatedAt;
  setDoc(doc(db, 'syncs', syncCode), { tasks, recurringTasks, updatedAt }).catch(() => {
    syncStatusEl.textContent = "Synchro en attente (pas de réseau ?)";
  });
}

function applyRemoteState(data) {
  lastSyncedAt = data.updatedAt;
  tasks = data.tasks || [];
  recurringTasks = data.recurringTasks || [];
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringTasks));
  carryOverUnfinished();
  materializeRecurring();
  render();
}

function startSync(code) {
  syncCode = code;
  localStorage.setItem(SYNC_CODE_KEY, code);
  if (syncUnsubscribe) syncUnsubscribe();
  syncUnsubscribe = onSnapshot(
    doc(db, 'syncs', code),
    (snap) => {
      if (!snap.exists()) {
        pushToCloud();
        syncStatusEl.textContent = 'Connecté — en attente du premier autre appareil.';
        return;
      }
      const data = snap.data();
      if (data.updatedAt !== lastSyncedAt) applyRemoteState(data);
      syncStatusEl.textContent = 'Connecté — dernière synchro : ' + new Date().toLocaleTimeString('fr-FR');
    },
    () => {
      syncStatusEl.textContent = 'Connexion à la synchro impossible pour le moment.';
    }
  );
  updateSyncUI();
}

function stopSync() {
  if (syncUnsubscribe) syncUnsubscribe();
  syncUnsubscribe = null;
  syncCode = null;
  localStorage.removeItem(SYNC_CODE_KEY);
  updateSyncUI();
}

function updateSyncUI() {
  const active = !!syncCode;
  syncInactiveEl.hidden = active;
  syncActiveEl.hidden = !active;
  if (active) syncCodeDisplay.textContent = syncCode;
}

function tasksForDate(dateKey) {
  return tasks.filter(t => t.date === dateKey);
}

function weightColor(weight) {
  if (weight >= 8) return '#e84393';
  if (weight >= 5) return '#6c5ce7';
  return '#74b9ff';
}

function computeScore(taskArr) {
  const totalWeight = taskArr.reduce((sum, t) => sum + t.weight, 0);
  const doneWeight = taskArr.filter(t => t.done).reduce((sum, t) => sum + t.weight, 0);
  const percent = totalWeight === 0 ? 0 : Math.round((doneWeight / totalWeight) * 100);
  return { totalWeight, doneWeight, percent };
}

function scoreMessage(percent, hasTasks) {
  if (!hasTasks) return "Aucune tâche pour l'instant";
  if (percent >= 80) return 'Journée Pareto : tu as attaqué l\'essentiel';
  if (percent >= 50) return 'Bonne progression sur ce qui compte';
  if (percent >= 20) return 'Encore du poids important à faire tomber';
  return "L'essentiel n'est pas encore fait";
}

// Undone one-off tasks left behind in the past get a fresh copy on today,
// bumped one point in importance, so procrastinating makes a task harder
// to ignore. The original stays put with its real done/undone state, so
// past days keep an honest score instead of quietly turning into 100%.
function carryOverUnfinished() {
  const today = todayKey();
  const toCarry = tasks.filter(t => !t.recurringId && !t.done && !t.carriedToId && t.date < today);
  if (toCarry.length === 0) return;

  toCarry.forEach(source => {
    const copy = {
      id: crypto.randomUUID(),
      title: source.title,
      weight: Math.min(source.weight + 1, 10),
      done: false,
      date: today,
      originalDate: source.originalDate,
      recurringId: null,
      carriedFromId: source.id,
      createdAt: new Date().toISOString(),
    };
    source.carriedToId = copy.id;
    tasks.push(copy);
  });
  saveTasks();
}

// Ensures every active recurring template has a real task instance
// for each matching weekday between today and the materialization horizon.
function materializeRecurring() {
  const start = todayKey();
  const end = addDaysToKey(start, MATERIALIZE_DAYS_AHEAD);
  let changed = false;
  recurringTasks.forEach(rt => {
    let cursor = start;
    while (cursor <= end) {
      const weekday = keyToDate(cursor).getDay();
      if (rt.days.includes(weekday)) {
        const exists = tasks.some(t => t.recurringId === rt.id && t.date === cursor);
        if (!exists) {
          tasks.push({
            id: crypto.randomUUID(),
            title: rt.title,
            weight: rt.weight,
            done: false,
            date: cursor,
            originalDate: cursor,
            recurringId: rt.id,
            createdAt: new Date().toISOString(),
          });
          changed = true;
        }
      }
      cursor = addDaysToKey(cursor, 1);
    }
  });
  if (changed) saveTasks();
}

function goToDate(key) {
  selectedDate = key;
  selectedTaskDate = key;
  render();
}

function setTaskDate(key) {
  selectedTaskDate = key;
  renderDayChips();
}

function render() {
  const dayTasks = tasksForDate(selectedDate);
  const sorted = [...dayTasks].sort((a, b) => b.weight - a.weight);

  taskListEl.innerHTML = '';
  emptyStateEl.hidden = dayTasks.length > 0;

  sorted.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => toggleTask(task.id));

    const title = document.createElement('span');
    title.className = 'task-title';

    if (task.recurringId) {
      const tag = document.createElement('span');
      tag.className = 'task-tag';
      tag.textContent = '↻';
      tag.title = 'Tâche récurrente';
      title.appendChild(tag);
    } else if (task.date !== task.originalDate) {
      const tag = document.createElement('span');
      tag.className = 'task-tag';
      tag.textContent = '↪';
      tag.title = 'Reportée depuis ' + shortLabel(task.originalDate);
      title.appendChild(tag);
    }
    title.appendChild(document.createTextNode(task.title));

    const badge = document.createElement('span');
    badge.className = 'task-weight-badge';
    badge.textContent = task.weight;
    badge.style.background = weightColor(task.weight);

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Supprimer la tâche');
    del.addEventListener('click', () => deleteTask(task.id));

    li.append(checkbox, title, badge, del);
    taskListEl.appendChild(li);
  });

  const { percent } = computeScore(dayTasks);
  scoreValueEl.textContent = percent + '%';
  scoreLabelEl.textContent = scoreMessage(percent, dayTasks.length > 0);
  scoreBarFillEl.style.width = percent + '%';

  const doneCount = dayTasks.filter(t => t.done).length;
  scoreSubEl.textContent = dayTasks.length > 0
    ? `${doneCount}/${dayTasks.length} tâches cochées — le score reflète le poids, pas le nombre`
    : '';

  const hasPriority = dayTasks.some(t => t.weight >= PRIORITY_THRESHOLD);
  priorityWarningEl.hidden = !(dayTasks.length > 0 && !hasPriority);

  const relative = relativeLabel(selectedDate);
  dayRelativeEl.textContent = relative || shortLabel(selectedDate);
  dateJumpInput.value = selectedDate;
  todayBtn.hidden = selectedDate === todayKey();

  listTitleEl.textContent = relative ? `Tâches — ${relative}` : `Tâches — ${shortLabel(selectedDate)}`;

  taskDateInput.value = selectedTaskDate;
  renderDayChips();
  renderRecurringList();
  renderUpcoming();
  renderHistory();
}

function renderDayChips() {
  dayChipsEl.innerHTML = '';
  const start = todayKey();
  const keys = [];
  for (let i = 0; i < 6; i++) keys.push(addDaysToKey(start, i));
  // keep the currently targeted day visible even if it falls outside the 6-day window
  if (!keys.includes(selectedTaskDate)) keys.push(selectedTaskDate);

  keys.forEach(key => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-chip' + (key === selectedTaskDate ? ' active' : '');
    btn.textContent = chipLabel(key);
    btn.addEventListener('click', () => setTaskDate(key));
    dayChipsEl.appendChild(btn);
  });
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) task.done = !task.done;
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  render();
}

function addTask(title, weight, dateKey) {
  tasks.push({
    id: crypto.randomUUID(),
    title: title.trim(),
    weight,
    done: false,
    date: dateKey,
    originalDate: dateKey,
    recurringId: null,
    createdAt: new Date().toISOString(),
  });
  saveTasks();
  render();
}

function addRecurringTask(title, weight, days) {
  recurringTasks.push({
    id: crypto.randomUUID(),
    title: title.trim(),
    weight,
    days,
    createdAt: new Date().toISOString(),
  });
  saveRecurringTasks();
  materializeRecurring();
  render();
}

function deleteRecurringTask(id) {
  recurringTasks = recurringTasks.filter(r => r.id !== id);
  saveRecurringTasks();
  const today = todayKey();
  tasks = tasks.filter(t => !(t.recurringId === id && t.date >= today && !t.done));
  saveTasks();
  render();
}

function renderRecurringList() {
  recurringWrap.hidden = recurringTasks.length === 0;
  recurringListEl.innerHTML = '';
  recurringTasks.forEach(rt => {
    const li = document.createElement('li');
    li.className = 'recurring-item';

    const info = document.createElement('span');
    info.className = 'recurring-info';
    info.textContent = `${rt.title} · ${weekdayPatternLabel(rt.days)}`;

    const badge = document.createElement('span');
    badge.className = 'task-weight-badge';
    badge.textContent = rt.weight;
    badge.style.background = weightColor(rt.weight);

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Arrêter cette récurrence');
    del.addEventListener('click', () => deleteRecurringTask(rt.id));

    li.append(info, badge, del);
    recurringListEl.appendChild(li);
  });
}

function buildDayListItem(dateKey) {
  const { percent } = computeScore(tasksForDate(dateKey));
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'history-item';
  btn.addEventListener('click', () => goToDate(dateKey));

  const date = document.createElement('span');
  date.className = 'history-date';
  date.textContent = shortLabel(dateKey);

  const score = document.createElement('span');
  score.className = 'history-score';
  score.textContent = percent + '%';

  btn.append(date, score);
  li.appendChild(btn);
  return li;
}

function buildUpcomingDayBlock(dateKey) {
  const dayTasks = [...tasksForDate(dateKey)].sort((a, b) => b.weight - a.weight);
  const { percent } = computeScore(dayTasks);

  const wrap = document.createElement('div');
  wrap.className = 'upcoming-day';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'upcoming-day-header';
  header.addEventListener('click', () => goToDate(dateKey));

  const dateEl = document.createElement('span');
  dateEl.className = 'upcoming-day-date';
  dateEl.textContent = relativeLabel(dateKey) || longLabel(dateKey);

  const scoreEl = document.createElement('span');
  scoreEl.className = 'upcoming-day-score';
  scoreEl.textContent = percent + '%';

  header.append(dateEl, scoreEl);

  const list = document.createElement('ul');
  list.className = 'upcoming-task-list';
  dayTasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'upcoming-task' + (task.done ? ' done' : '');

    const title = document.createElement('span');
    title.className = 'upcoming-task-title';
    if (task.recurringId) {
      const tag = document.createElement('span');
      tag.className = 'task-tag';
      tag.textContent = '↻';
      tag.title = 'Tâche récurrente';
      title.appendChild(tag);
    }
    title.appendChild(document.createTextNode(task.title));

    const weight = document.createElement('span');
    weight.className = 'upcoming-task-weight';
    weight.textContent = task.weight;
    weight.style.color = weightColor(task.weight);

    li.append(title, weight);
    list.appendChild(li);
  });

  wrap.append(header, list);
  return wrap;
}

function renderUpcoming() {
  const today = todayKey();
  const futureDates = [...new Set(tasks.filter(t => t.date > today).map(t => t.date))].sort();
  upcomingWrap.hidden = futureDates.length === 0;
  upcomingList.innerHTML = '';
  futureDates.forEach(dateKey => upcomingList.appendChild(buildUpcomingDayBlock(dateKey)));
}

function renderHistory() {
  const today = todayKey();
  const pastDates = [...new Set(tasks.filter(t => t.date < today).map(t => t.date))].sort().reverse();
  historyWrap.hidden = pastDates.length === 0;
  historyList.innerHTML = '';
  pastDates.slice(0, 30).forEach(dateKey => historyList.appendChild(buildDayListItem(dateKey)));
}

weightInput.addEventListener('input', () => {
  weightValueEl.textContent = weightInput.value;
});

repeatModeSelect.addEventListener('change', () => {
  const mode = repeatModeSelect.value;
  weekdayPicker.hidden = mode !== 'custom';
  datePickerRow.hidden = mode !== 'once';
});

weekdayPicker.querySelectorAll('.weekday-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const day = Number(btn.dataset.day);
    if (selectedWeekdays.has(day)) {
      selectedWeekdays.delete(day);
      btn.classList.remove('active');
    } else {
      selectedWeekdays.add(day);
      btn.classList.add('active');
    }
  });
});

otherDateToggle.addEventListener('click', () => {
  taskDateInput.hidden = !taskDateInput.hidden;
  if (!taskDateInput.hidden) {
    taskDateInput.value = selectedTaskDate;
    taskDateInput.focus();
  }
});

taskDateInput.addEventListener('change', () => {
  if (taskDateInput.value) setTaskDate(taskDateInput.value);
});

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  const weight = Number(weightInput.value);
  const mode = repeatModeSelect.value;

  if (mode === 'once') {
    addTask(title, weight, selectedTaskDate);
  } else {
    const days = mode === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : [...selectedWeekdays];
    if (days.length === 0) {
      alert('Choisis au moins un jour pour une tâche récurrente.');
      return;
    }
    addRecurringTask(title, weight, days);
  }

  titleInput.value = '';
  weightInput.value = 5;
  weightValueEl.textContent = '5';
  repeatModeSelect.value = 'once';
  weekdayPicker.hidden = true;
  datePickerRow.hidden = false;
  selectedWeekdays.clear();
  weekdayPicker.querySelectorAll('.weekday-chip.active').forEach(b => b.classList.remove('active'));
  taskDateInput.hidden = true;
  setTaskDate(selectedDate);
  titleInput.focus();
});

prevDayBtn.addEventListener('click', () => goToDate(addDaysToKey(selectedDate, -1)));
nextDayBtn.addEventListener('click', () => goToDate(addDaysToKey(selectedDate, 1)));
todayBtn.addEventListener('click', () => goToDate(todayKey()));
dateJumpInput.addEventListener('change', () => {
  if (dateJumpInput.value) goToDate(dateJumpInput.value);
});

createSyncBtn.addEventListener('click', () => {
  const code = crypto.randomUUID().replace(/-/g, '');
  startSync(code);
});

joinSyncBtn.addEventListener('click', () => {
  const code = joinSyncInput.value.trim();
  if (code.length < 20) {
    alert('Ce code ne semble pas valide — colle-le tel quel depuis ton autre appareil.');
    return;
  }
  joinSyncInput.value = '';
  startSync(code);
});

copySyncBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(syncCode).then(() => {
    copySyncBtn.textContent = 'Copié !';
    setTimeout(() => { copySyncBtn.textContent = 'Copier'; }, 1500);
  });
});

disableSyncBtn.addEventListener('click', () => {
  if (confirm('Désactiver la synchronisation sur cet appareil ? Tes tâches restent en local.')) {
    stopSync();
  }
});

carryOverUnfinished();
materializeRecurring();
render();
updateSyncUI();
if (syncCode) startSync(syncCode);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
