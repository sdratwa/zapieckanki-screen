const params = new URLSearchParams(window.location.search);
const screenPos = Number.parseInt(params.get('pos') ?? '0', 10) || 0;
const instanceId = params.get('instance') || 'default';

const belt = document.getElementById('belt') as HTMLDivElement;
const prevEl = document.getElementById('prev') as HTMLElement;
const currEl = document.getElementById('curr') as HTMLElement;
const nextEl = document.getElementById('next') as HTMLElement;
const badgeEl = document.getElementById('badge') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const stageEl = document.querySelector('.stage') as HTMLElement;

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY as string | undefined;
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER as string | undefined;
const useBroadcastFallback = !PUSHER_KEY;

// Channel will be created AFTER we know the groupId
let channelName = '';
let channel: BroadcastChannel | null = null;

let products: string[] = [];
let startIndex = 0;
let pendingStartIndex: number | null = null;
let isAnimating = false;
let layoutMode: LayoutMode = 'card';
let lastSequence = -1;
let activeSessionId: string | null = null;

// Autonomous timer state
let serverStartTime: number | null = null;
let intervalMs: number = 10000;
let autonomousTimer: number | null = null;
let driftCorrectionTimer: number | null = null;

const TRANSITION_MS = 700;
const DRIFT_CORRECTION_INTERVAL = 10000; // Check drift every 10s

function commitPendingStartIndex() {
  if (pendingStartIndex === null) return;
  if (products.length > 0) {
    startIndex = normalizeIndex(pendingStartIndex, products.length);
  } else {
    startIndex = 0;
  }
  pendingStartIndex = null;
}

function setBadge() {
  badgeEl.textContent = `Screen #${screenPos}`;
}

function setStatus(text: string) {
  statusEl.textContent = text;
}

function normalizeIndex(index: number, length: number): number {
  if (length === 0) return 0;
  const mod = index % length;
  return mod < 0 ? mod + length : mod;
}

function productIndex(offset: number, baseStartIndex: number = startIndex): number {
  const length = products.length;
  if (length === 0) return 0;
  const index = baseStartIndex + screenPos + offset;
  return normalizeIndex(index, length);
}

function extractImgTag(productHtml: string): string {
  // If layoutMode is 'image', extract only <img> tag from HTML
  if (layoutMode === 'image') {
    const imgMatch = productHtml.match(/<img[^>]*>/i);
    return imgMatch ? imgMatch[0] : productHtml;
  }
  return productHtml;
}

function renderSlides(baseStartIndex: number = startIndex) {
  if (products.length === 0) {
    prevEl.innerHTML = '';
    currEl.innerHTML = '<em>Brak produktów</em>';
    nextEl.innerHTML = '';
    setStatus('Oczekiwanie na kontroler…');
    stageEl.classList.toggle('stage--image', layoutMode === 'image');
    return;
  }

  // Get content and extract <img> if in image mode
  const prevContent = extractImgTag(products[productIndex(-1, baseStartIndex)] ?? '');
  const currContent = extractImgTag(products[productIndex(0, baseStartIndex)] ?? '');
  const nextContent = extractImgTag(products[productIndex(1, baseStartIndex)] ?? '');

  // Only update innerHTML if content has changed (prevents unnecessary image reloads and flickering)
  if (prevEl.innerHTML !== prevContent) {
    prevEl.innerHTML = prevContent;
  }
  if (currEl.innerHTML !== currContent) {
    currEl.innerHTML = currContent;
  }
  if (nextEl.innerHTML !== nextContent) {
    nextEl.innerHTML = nextContent;
  }

  const currentIndex = productIndex(0, baseStartIndex);
  setStatus(`Produkt ${currentIndex + 1} z ${products.length}`);
  stageEl.classList.toggle('stage--image', layoutMode === 'image');
}

function snapToCenter() {
  belt.style.transition = 'none';
  belt.style.transform = 'translateX(-100vw)';
  void belt.offsetWidth;
  belt.style.transition = `transform ${TRANSITION_MS}ms ease`;
}

function animateLeft() {
  if (isAnimating) return;
  isAnimating = true;
  belt.style.transform = 'translateX(-200vw)';
  const onDone = () => {
    belt.removeEventListener('transitionend', onDone);
    commitPendingStartIndex();
    
    // After animation and snapToCenter, currEl will be in center again
    // Update all three divs with new content based on new startIndex
    // Use extractImgTag to respect layoutMode
    const newPrevContent = extractImgTag(products[productIndex(-1, startIndex)] ?? '');
    const newCurrContent = extractImgTag(products[productIndex(0, startIndex)] ?? '');
    const newNextContent = extractImgTag(products[productIndex(1, startIndex)] ?? '');
    
    if (prevEl.innerHTML !== newPrevContent) {
      prevEl.innerHTML = newPrevContent;
    }
    if (currEl.innerHTML !== newCurrContent) {
      currEl.innerHTML = newCurrContent;
    }
    if (nextEl.innerHTML !== newNextContent) {
      nextEl.innerHTML = newNextContent;
    }
    
    // Update status
    const currentIndex = productIndex(0, startIndex);
    setStatus(`Produkt ${currentIndex + 1} z ${products.length}`);
    stageEl.classList.toggle('stage--image', layoutMode === 'image');
    
    snapToCenter();
    isAnimating = false;
  };
  belt.addEventListener('transitionend', onDone);
}

// ==================== AUTONOMOUS TIMER ====================

function calculateGlobalIndex(): number {
  if (!serverStartTime || !intervalMs) return 0;
  const elapsed = Date.now() - serverStartTime;
  return Math.floor(elapsed / intervalMs);
}

function stopAutonomousTimer() {
  if (autonomousTimer !== null) {
    clearInterval(autonomousTimer);
    autonomousTimer = null;
  }
  if (driftCorrectionTimer !== null) {
    clearInterval(driftCorrectionTimer);
    driftCorrectionTimer = null;
  }
}

function syncToGlobalIndex() {
  const globalIndex = calculateGlobalIndex();
  const newStartIndex = normalizeIndex(globalIndex, products.length);

  if (newStartIndex !== startIndex) {
    pendingStartIndex = newStartIndex;
    
    // Only update nextEl with the upcoming product (prevents double rendering)
    // Use offset=0 with pendingStartIndex because nextEl will become currEl after animation
    // Use extractImgTag to respect layoutMode
    const nextContent = extractImgTag(products[productIndex(0, pendingStartIndex)] ?? '');
    if (nextEl.innerHTML !== nextContent) {
      nextEl.innerHTML = nextContent;
    }
    
    requestAnimationFrame(() => {
      if (!isAnimating) {
        animateLeft();
      }
    });
  }
}

function startAutonomousTimer() {
  stopAutonomousTimer();

  if (!serverStartTime || products.length === 0) {
    return;
  }

  // Initial sync to correct index
  const globalIndex = calculateGlobalIndex();
  startIndex = normalizeIndex(globalIndex, products.length);
  renderSlides(startIndex);
  snapToCenter();

  // Schedule next tick at the exact interval boundary
  const elapsed = Date.now() - serverStartTime;
  const nextTickIn = intervalMs - (elapsed % intervalMs);

  setTimeout(() => {
    syncToGlobalIndex();

    // Start regular interval
    autonomousTimer = window.setInterval(() => {
      syncToGlobalIndex();
    }, intervalMs);

    // Start drift correction timer - force re-sync every 30s
    driftCorrectionTimer = window.setInterval(() => {
      const expectedGlobalIndex = calculateGlobalIndex();
      const currentDisplayedIndex = productIndex(0);
      
      // If we're showing wrong product, force sync
      if (expectedGlobalIndex !== startIndex) {
        console.log(`Drift detected - re-syncing. Expected global: ${expectedGlobalIndex}, current: ${startIndex}`);
        startIndex = normalizeIndex(expectedGlobalIndex, products.length);
        renderSlides(startIndex);
        snapToCenter();
      }
    }, 30000); // Check every 30s
  }, nextTickIn);
}

function handleMessage(message: RotationMessage) {
  // CRITICAL: Wait for screen initialization to complete
  if (!currentGroup || !currentMode) {
    console.debug('Screen not initialized yet, ignoring message');
    return;
  }

  // Validate sequence to prevent duplicate/old messages
  if (typeof message.sequence === 'number' && message.sequence <= lastSequence) {
    console.debug(`Ignoring old/duplicate message: sequence ${message.sequence} <= ${lastSequence}`);
    return;
  }

  // NOTE: No need to filter by groupId anymore - each screen subscribes to its own channel!

  // Update last sequence and session tracking
  lastSequence = message.sequence ?? lastSequence;
  
  // Track active session for debugging (but don't block other controllers)
  if (message.sessionId && message.sessionId !== activeSessionId) {
    console.log(`Controller switched: ${activeSessionId || 'none'} → ${message.sessionId}`);
    activeSessionId = message.sessionId;
  }

  // STATIC MODE - handle config updates but ignore rotation events
  if (currentMode === 'static') {
    console.debug('Static mode - processing config update');
    
    // Update layout and production mode
    layoutMode = message.layoutMode ?? layoutMode;
    if (message.productionMode !== undefined) {
      document.body.classList.toggle('production-mode', message.productionMode);
      setStatus(message.productionMode ? '' : 'Statyczny');
    }
    stageEl.classList.toggle('stage--image', layoutMode === 'image');
    
    // Update product if provided - use extractImgTag to respect layoutMode
    if (message.products && message.products.length > 0) {
      currEl.innerHTML = extractImgTag(message.products[0] || '');
    }
    
    // Ignore init/stop events
    return;
  }

  products = message.products ?? [];
  layoutMode = message.layoutMode ?? 'card';
  intervalMs = message.intervalMs ?? 10000;

  // Update production mode (hide/show UI counters)
  if (message.productionMode !== undefined) {
    document.body.classList.toggle('production-mode', message.productionMode);
  }

  switch (message.type) {
    case 'init':
      // Use shared group start time for perfect sync across all screens
      serverStartTime = message.startTime ?? message.serverTime ?? Date.now();
      pendingStartIndex = null;
      isAnimating = false;

      // Start autonomous timer with server-time sync
      startAutonomousTimer();
      setStatus('Zsynchronizowano - autonomiczny timer aktywny');
      break;

    case 'stop':
      stopAutonomousTimer();
      commitPendingStartIndex();
      renderSlides(startIndex);
      setStatus('Zatrzymano');
      break;

    case 'config-update':
      // Config changed (layout, products, production mode) - re-render but DON'T restart timer
      console.log('Config updated - re-rendering slides');
      renderSlides(startIndex);
      stageEl.classList.toggle('stage--image', layoutMode === 'image');
      break;

    default:
      break;
  }
}

async function setupRealtimeForGroup(groupId: string) {
  // Build channel name with groupId: rotation-{instanceId}-{groupId}
  channelName = useBroadcastFallback
    ? `multiwall::rotation-${groupId}`
    : `rotation-${instanceId}-${groupId}`;

  console.log(`Subscribing to channel: ${channelName}`);

  if (!useBroadcastFallback) {
    const { default: Pusher } = await import('pusher-js');
    const pusher = new Pusher(PUSHER_KEY!, {
      cluster: PUSHER_CLUSTER!,
      forceTLS: true,
    });
    const subscription = pusher.subscribe(channelName);
    subscription.bind('rotation-event', (data: RotationEnvelope) => {
      handleMessage(data.payload);
    });
  } else {
    channel = new BroadcastChannel(channelName);
    channel.addEventListener('message', (event) => {
      const message = event.data as RotationMessage;
      handleMessage(message);
    });
  }
}

// ==================== TYPES ====================

interface RotationMessage {
  type: 'init' | 'tick' | 'stop' | 'config-update';
  ts: number;
  sessionId: string;
  sequence: number;
  startIndex: number;
  intervalMs: number;
  products: string[];
  layoutMode?: LayoutMode;
  serverTime?: number; // Legacy - still provided by server for fallback
  startTime?: number; // Shared start time from group - used for sync
  instanceId?: string;
  productionMode?: boolean;
  groupId?: string; // For group-specific updates
}

type LayoutMode = 'card' | 'image';

interface RotationEnvelope {
  type: 'init' | 'tick' | 'stop' | 'config-update';
  payload: RotationMessage;
}

interface AdGroup {
  id: string;
  name: string;
  type: 'carousel' | 'static';
  products: string[];
  layoutMode: 'card' | 'image';
  productionMode: boolean;
  intervalSeconds?: number;
  isRunning?: boolean;
  startTime?: number;
}

interface InstanceConfig {
  adGroups: AdGroup[];
  screenAssignments: Record<string, string>;
}

// ==================== INITIALIZATION ====================

let currentGroup: AdGroup | null = null;
let currentMode: 'carousel' | 'static' | null = null;

async function initScreen() {
  setBadge();
  setStatus('Ładowanie konfiguracji...');
  
  try {
    // Fetch instance configuration
    const response = await fetch(`/api/instances/${instanceId}/config`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const config: InstanceConfig = await response.json();
    
    // Find which group this screen belongs to
    const myGroupId = config.screenAssignments[screenPos.toString()];
    if (!myGroupId) {
      setStatus(`Ekran ${screenPos} nie przypisany do żadnej grupy`);
      return;
    }
    
    const myGroup = config.adGroups.find(g => g.id === myGroupId);
    if (!myGroup) {
      setStatus('Grupa nie znaleziona');
      return;
    }
    
    currentGroup = myGroup;
    currentMode = myGroup.type;
    
    // Setup based on group type
    if (myGroup.type === 'carousel') {
      await setupCarouselMode(myGroup);
    } else if (myGroup.type === 'static') {
      await setupStaticMode(myGroup);
    }
    
  } catch (error) {
    console.error('Failed to initialize screen:', error);
    setStatus('Błąd inicjalizacji');
  }
}

async function setupCarouselMode(group: AdGroup) {
  console.log(`Setting up carousel mode for group: ${group.name}`);
  
  products = group.products;
  layoutMode = group.layoutMode;
  intervalMs = (group.intervalSeconds || 10) * 1000;
  document.body.classList.toggle('production-mode', group.productionMode ?? false);
  
  // Render initial state
  renderSlides();
  
  // Subscribe to THIS GROUP's channel
  await setupRealtimeForGroup(group.id);
  
  // AUTO-START if group is already running
  if (group.isRunning === true && group.startTime) {
    console.log(`Group is already running - auto-starting timer with shared startTime: ${group.startTime}`);
    serverStartTime = group.startTime; // ← USE THE SAME START TIME FOR ALL SCREENS!
    startAutonomousTimer();
    setStatus('Auto-start - zsynchronizowano');
  } else {
    setStatus('Oczekiwanie na start...');
  }
}

async function setupStaticMode(group: AdGroup) {
  console.log(`Setting up static mode for group: ${group.name}`);
  
  layoutMode = group.layoutMode;
  document.body.classList.toggle('production-mode', group.productionMode ?? false);
  
  // Render first product (static, no rotation) - use extractImgTag to respect layoutMode
  if (group.products.length > 0) {
    currEl.innerHTML = extractImgTag(group.products[0] || '');
    setStatus(group.productionMode ? '' : 'Statyczny');
  } else {
    currEl.innerHTML = '<em>Brak produktu</em>';
    setStatus('Brak produktu');
  }
  
  stageEl.classList.toggle('stage--image', layoutMode === 'image');
  
  // Hide prev/next slides for static mode
  prevEl.innerHTML = '';
  nextEl.innerHTML = '';
  
  // Subscribe to THIS GROUP's channel (even though static screens ignore rotation events)
  await setupRealtimeForGroup(group.id);
}

// Initialize screen on load
window.addEventListener('focus', () => setBadge());
setBadge();
snapToCenter();
void initScreen();
