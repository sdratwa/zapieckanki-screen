// ==================== TYPES ====================

interface AdGroup {
  id: string;
  name: string;
  type: 'carousel' | 'static';
  products: string[];
  layoutMode: 'card' | 'image';
  productionMode: boolean;
  intervalSeconds?: number;
}

interface InstanceConfig {
  adGroups: AdGroup[];
  screenAssignments: Record<string, string>; // screenId -> groupId
}

interface Instance {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
}

// ==================== URL & INSTANCE ====================

function getInstanceIdFromURL(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('instance');
}

const instanceId = getInstanceIdFromURL();

if (!instanceId) {
  window.location.href = '/';
  throw new Error('No instance specified');
}

async function loadInstance(): Promise<Instance | null> {
  try {
    const response = await fetch(`/api/instances/${instanceId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Failed to load instance:', error);
    return null;
  }
}

// ==================== UI ELEMENTS ====================

const instanceNameEl = document.getElementById('instanceName') as HTMLElement;
const groupsListEl = document.getElementById('groupsList') as HTMLElement;
const screenAssignmentsListEl = document.getElementById('screenAssignmentsList') as HTMLElement;
const addGroupBtn = document.getElementById('addGroupBtn') as HTMLButtonElement;
const addScreenBtn = document.getElementById('addScreenBtn') as HTMLButtonElement;
const startAllBtn = document.getElementById('startAllBtn') as HTMLButtonElement;
const stopAllBtn = document.getElementById('stopAllBtn') as HTMLButtonElement;
const screenPosInput = document.getElementById('screenPos') as HTMLInputElement;

// Modal elements
const groupModal = document.getElementById('groupModal') as HTMLElement;
const modalTitle = document.getElementById('modalTitle') as HTMLElement;
const editGroupIdInput = document.getElementById('editGroupId') as HTMLInputElement;
const groupNameInput = document.getElementById('groupName') as HTMLInputElement;
const groupTypeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="groupType"]')
);
const groupIntervalInput = document.getElementById('groupInterval') as HTMLInputElement;
const groupLayoutInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="groupLayoutMode"]')
);
const groupProductionModeCheckbox = document.getElementById('groupProductionMode') as HTMLInputElement;
const groupProductsTextarea = document.getElementById('groupProducts') as HTMLTextAreaElement;
const intervalField = document.getElementById('intervalField') as HTMLElement;

// ==================== PUSHER ====================

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY as string | undefined;
const PUSHER_ENDPOINT = normalizePusherEndpoint(
  (import.meta.env.VITE_PUSHER_ENDPOINT as string | undefined) ?? '/trigger'
);
const useBroadcastFallback = !PUSHER_KEY;
const broadcastChannel = useBroadcastFallback
  ? new BroadcastChannel('multiwall::rotation')
  : null;

const sessionId = generateSessionId();
let lastSequenceTime = 0;

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function normalizePusherEndpoint(url: string): string {
  if (url.startsWith('/')) return url;
  if (window.location.protocol === 'https:' && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

function nextSequence(): number {
  const now = Date.now();
  if (now <= lastSequenceTime) {
    lastSequenceTime += 1;
  } else {
    lastSequenceTime = now;
  }
  return lastSequenceTime;
}

async function broadcast(type: 'init' | 'stop', groupId: string, group: AdGroup) {
  const payload = {
    type,
    ts: performance.now(),
    sessionId,
    sequence: nextSequence(),
    startIndex: 0,
    intervalMs: (group.intervalSeconds || 10) * 1000,
    products: group.products,
    layoutMode: group.layoutMode,
    productionMode: group.productionMode,
    instanceId,
    groupId,
  };

  if (useBroadcastFallback) {
    broadcastChannel?.postMessage(payload);
    return;
  }

  try {
    const response = await fetch(PUSHER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload }),
    });

    if (!response.ok) {
      console.error('Pusher trigger failed:', response.statusText);
    }
  } catch (error) {
    console.error('Pusher trigger error:', error);
  }
}

// ==================== CONFIG MANAGEMENT ====================

let currentConfig: InstanceConfig = {
  adGroups: [],
  screenAssignments: {},
};

async function loadConfig() {
  try {
    const response = await fetch(`/api/instances/${instanceId}/config`);
    if (!response.ok) {
      console.error('Failed to load config:', response.statusText);
      return;
    }
    currentConfig = await response.json();
    renderGroups();
    renderScreenAssignments();
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

async function saveConfig() {
  try {
    const response = await fetch(`/api/instances/${instanceId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentConfig),
    });

    if (!response.ok) {
      console.error('Failed to save config:', response.statusText);
      alert('Błąd zapisu konfiguracji');
    }
  } catch (error) {
    console.error('Failed to save config:', error);
    alert('Błąd zapisu konfiguracji');
  }
}

// ==================== UI RENDERING ====================

function renderGroups() {
  if (currentConfig.adGroups.length === 0) {
    groupsListEl.innerHTML = '<p class="hint">Brak grup. Kliknij "+ Nowa grupa" aby dodać pierwszą.</p>';
    return;
  }

  groupsListEl.innerHTML = currentConfig.adGroups
    .map((group) => renderGroupItem(group))
    .join('');
}

function renderGroupItem(group: AdGroup): string {
  const typeLabel = group.type === 'carousel' ? 'Karuzela' : 'Statyczny';
  const intervalLabel = group.type === 'carousel' ? `Interwał: ${group.intervalSeconds}s` : '';
  const layoutLabel = group.layoutMode === 'card' ? 'Karta produktu' : 'Pełny ekran';
  const productCountLabel = `${group.products.length} produkt(ów)`;
  
  // Find screens assigned to this group
  const assignedScreens = Object.entries(currentConfig.screenAssignments)
    .filter(([_, groupId]) => groupId === group.id)
    .map(([screenId]) => `#${screenId}`)
    .join(', ');
  const screensLabel = assignedScreens || 'Brak przypisanych ekranów';

  return `
    <div class="group-item" data-group-id="${group.id}">
      <div class="group-header">
        <div class="group-info">
          <h3 class="group-name">${escapeHtml(group.name)}</h3>
          <div class="group-meta">
            <span>🔄 ${typeLabel}</span>
            ${intervalLabel ? `<span>⏱️ ${intervalLabel}</span>` : ''}
            <span>🎨 ${layoutLabel}</span>
            <span>📦 ${productCountLabel}</span>
          </div>
        </div>
        <div class="group-actions">
          ${group.type === 'carousel' ? `
            <button class="btn btn-success btn-small" onclick="startGroup('${group.id}')">▶️ START</button>
            <button class="btn btn-danger btn-small" onclick="stopGroup('${group.id}')">⏹️ STOP</button>
          ` : ''}
          <button class="btn btn-secondary btn-small" onclick="editGroup('${group.id}')">⚙️ Edytuj</button>
          <button class="btn btn-danger btn-small" onclick="deleteGroup('${group.id}')">🗑️ Usuń</button>
        </div>
      </div>
      <div class="group-screens">
        🖥️ Ekrany: ${screensLabel}
      </div>
    </div>
  `;
}

function renderScreenAssignments() {
  const screenIds = Object.keys(currentConfig.screenAssignments).map(Number).sort((a, b) => a - b);
  
  if (screenIds.length === 0) {
    screenAssignmentsListEl.innerHTML = '<p class="hint">Brak ekranów. Kliknij "+ Dodaj ekran" aby dodać pierwszy.</p>';
    return;
  }

  screenAssignmentsListEl.innerHTML = screenIds
    .map((screenId) => {
      const groupId = currentConfig.screenAssignments[screenId.toString()];
      const groupOptions = currentConfig.adGroups
        .map((group) => `<option value="${group.id}" ${group.id === groupId ? 'selected' : ''}>${escapeHtml(group.name)}</option>`)
        .join('');

      return `
        <div class="screen-assignment">
          <span class="screen-label">Screen #${screenId}</span>
          <select data-screen-id="${screenId}" onchange="updateScreenAssignment(${screenId}, this.value)">
            <option value="">-- Brak przypisania --</option>
            ${groupOptions}
          </select>
          <button class="btn-small" onclick="removeScreen(${screenId})">🗑️ Usuń</button>
        </div>
      `;
    })
    .join('');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== GROUP OPERATIONS ====================

(window as any).openNewGroupModal = function() {
  editGroupIdInput.value = '';
  modalTitle.textContent = 'Nowa grupa';
  groupNameInput.value = '';
  groupTypeInputs.find((input) => input.value === 'carousel')!.checked = true;
  groupIntervalInput.value = '10';
  groupLayoutInputs.find((input) => input.value === 'image')!.checked = true;
  groupProductionModeCheckbox.checked = true;
  groupProductsTextarea.value = '';
  intervalField.style.display = 'flex';
  groupModal.style.display = 'flex';
};

(window as any).editGroup = function(groupId: string) {
  const group = currentConfig.adGroups.find((g) => g.id === groupId);
  if (!group) return;

  editGroupIdInput.value = group.id;
  modalTitle.textContent = 'Edytuj grupę';
  groupNameInput.value = group.name;
  groupTypeInputs.find((input) => input.value === group.type)!.checked = true;
  groupIntervalInput.value = (group.intervalSeconds || 10).toString();
  groupLayoutInputs.find((input) => input.value === group.layoutMode)!.checked = true;
  groupProductionModeCheckbox.checked = group.productionMode;
  groupProductsTextarea.value = group.products.join('\n\n');
  intervalField.style.display = group.type === 'carousel' ? 'flex' : 'none';
  groupModal.style.display = 'flex';
};

(window as any).closeGroupModal = function() {
  groupModal.style.display = 'none';
};

(window as any).saveGroup = async function() {
  const groupId = editGroupIdInput.value || `group-${Date.now()}`;
  const name = groupNameInput.value.trim();
  const type = groupTypeInputs.find((input) => input.checked)?.value as 'carousel' | 'static';
  const intervalSeconds = Number.parseInt(groupIntervalInput.value, 10) || 10;
  const layoutMode = groupLayoutInputs.find((input) => input.checked)?.value as 'card' | 'image';
  const productionMode = groupProductionModeCheckbox.checked;
  const productsRaw = groupProductsTextarea.value.trim();

  if (!name) {
    alert('Nazwa grupy jest wymagana');
    return;
  }

  // Parse products (split by double newlines for HTML blocks, or by single newlines for simple tags)
  const products = productsRaw.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
  
  if (products.length === 0) {
    alert('Dodaj przynajmniej jeden produkt');
    return;
  }

  const newGroup: AdGroup = {
    id: groupId,
    name,
    type,
    products,
    layoutMode,
    productionMode,
    intervalSeconds: type === 'carousel' ? intervalSeconds : undefined,
  };

  // Update or add group
  const existingIndex = currentConfig.adGroups.findIndex((g) => g.id === groupId);
  if (existingIndex >= 0) {
    currentConfig.adGroups[existingIndex] = newGroup;
  } else {
    currentConfig.adGroups.push(newGroup);
  }

  await saveConfig();
  await loadConfig();
  
  (window as any).closeGroupModal();
};

(window as any).deleteGroup = async function(groupId: string) {
  if (!confirm('Czy na pewno usunąć tę grupę?')) return;

  // Remove group
  currentConfig.adGroups = currentConfig.adGroups.filter((g) => g.id !== groupId);

  // Remove screen assignments pointing to this group
  for (const screenId in currentConfig.screenAssignments) {
    if (currentConfig.screenAssignments[screenId] === groupId) {
      delete currentConfig.screenAssignments[screenId];
    }
  }

  // Send stop event to Pusher for this group
  const dummyGroup: AdGroup = {
    id: groupId,
    name: '',
    type: 'carousel',
    products: [],
    layoutMode: 'image',
    productionMode: false,
  };
  await broadcast('stop', groupId, dummyGroup);

  await saveConfig();
  await loadConfig();
};

(window as any).startGroup = async function(groupId: string) {
  const group = currentConfig.adGroups.find((g) => g.id === groupId);
  if (!group) return;

  await broadcast('init', groupId, group);
};

(window as any).stopGroup = async function(groupId: string) {
  const group = currentConfig.adGroups.find((g) => g.id === groupId);
  if (!group) return;

  await broadcast('stop', groupId, group);
};

// ==================== SCREEN ASSIGNMENT OPERATIONS ====================

(window as any).updateScreenAssignment = async function(screenId: number, groupId: string) {
  if (groupId) {
    currentConfig.screenAssignments[screenId.toString()] = groupId;
  } else {
    delete currentConfig.screenAssignments[screenId.toString()];
  }

  await saveConfig();
  renderGroups(); // Re-render to update "Ekrany" labels
};

(window as any).removeScreen = async function(screenId: number) {
  if (!confirm(`Czy na pewno usunąć ekran #${screenId}?`)) return;

  delete currentConfig.screenAssignments[screenId.toString()];

  await saveConfig();
  await loadConfig();
};

(window as any).addNewScreen = function() {
  const newScreenId = prompt('Numer nowego ekranu (0-99):');
  if (!newScreenId) return;

  const screenNum = Number.parseInt(newScreenId, 10);
  if (isNaN(screenNum) || screenNum < 0 || screenNum > 99) {
    alert('Nieprawidłowy numer ekranu');
    return;
  }

  if (currentConfig.screenAssignments[screenNum.toString()]) {
    alert(`Ekran #${screenNum} już istnieje`);
    return;
  }

  // Add screen with no assignment (user will select group from dropdown)
  currentConfig.screenAssignments[screenNum.toString()] = '';
  
  saveConfig().then(() => loadConfig());
};

// ==================== GLOBAL OPERATIONS ====================

(window as any).startAll = async function() {
  for (const group of currentConfig.adGroups) {
    if (group.type === 'carousel') {
      await broadcast('init', group.id, group);
    }
  }
};

(window as any).stopAll = async function() {
  for (const group of currentConfig.adGroups) {
    await broadcast('stop', group.id, group);
  }
};

// ==================== SCREEN LAUNCHER ====================

(window as any).adjustScreenPos = function(delta: number) {
  const currentVal = Number.parseInt(screenPosInput.value, 10) || 0;
  const newVal = Math.max(0, Math.min(99, currentVal + delta));
  screenPosInput.value = newVal.toString();
};

(window as any).openScreenWindow = function() {
  const pos = screenPosInput.value;
  const url = `/screen.html?instance=${instanceId}&pos=${pos}`;
  window.open(url, `screen-${instanceId}-${pos}`, 'width=1920,height=1080');
};

// ==================== EVENT LISTENERS ====================

addGroupBtn.addEventListener('click', () => {
  (window as any).openNewGroupModal();
});

addScreenBtn.addEventListener('click', () => {
  (window as any).addNewScreen();
});

startAllBtn.addEventListener('click', () => {
  (window as any).startAll();
});

stopAllBtn.addEventListener('click', () => {
  (window as any).stopAll();
});

// Hide/show interval field based on group type
groupTypeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    intervalField.style.display = input.value === 'carousel' ? 'flex' : 'none';
  });
});

// ==================== INITIALIZATION ====================

async function init() {
  const instance = await loadInstance();
  if (!instance) {
    alert('Instancja nie znaleziona');
    window.location.href = '/';
    return;
  }

  instanceNameEl.textContent = instance.name;
  await loadConfig();
}

void init();
