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
const channelName = useBroadcastFallback
  ? 'multiwall::rotation'
  : `rotation-${instanceId}`;
const channel = useBroadcastFallback ? new BroadcastChannel(channelName) : null;

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

function renderSlides(baseStartIndex: number = startIndex) {
  if (products.length === 0) {
    prevEl.innerHTML = '';
    currEl.innerHTML = '<em>Brak produktów</em>';
    nextEl.innerHTML = '';
    setStatus('Oczekiwanie na kontroler…');
    stageEl.classList.toggle('stage--image', layoutMode === 'image');
    return;
  }

  const prevContent = products[productIndex(-1, baseStartIndex)] ?? '';
  const currContent = products[productIndex(0, baseStartIndex)] ?? '';
  const nextContent = products[productIndex(1, baseStartIndex)] ?? '';

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
    renderSlides(startIndex);
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
    const nextContent = products[productIndex(1, pendingStartIndex)] ?? '';
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
  if (!message.sessionId) {
    console.warn('Received message without sessionId', message);
    return;
  }

  if (activeSessionId && message.sessionId !== activeSessionId) {
    return;
  }

  if (!activeSessionId) {
    activeSessionId = message.sessionId;
  }

  if (typeof message.sequence === 'number' && message.sequence <= lastSequence) {
    return;
  }

  lastSequence = message.sequence ?? lastSequence;

  products = message.products ?? [];
  layoutMode = message.layoutMode ?? 'card';
  intervalMs = message.intervalMs ?? 10000;

  switch (message.type) {
    case 'init':
      // Server provides the synchronized start time
      serverStartTime = message.serverTime ?? Date.now();
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

    default:
      break;
  }
}

async function setupRealtime() {
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
  }

  if (channel) {
    channel.addEventListener('message', (event) => {
      const message = event.data as RotationMessage;
      handleMessage(message);
    });
  }
}

window.addEventListener('focus', () => setBadge());
setBadge();
snapToCenter();
setStatus('Oczekiwanie na kontroler…');
void setupRealtime();

interface RotationMessage {
  type: 'init' | 'tick' | 'stop';
  ts: number;
  sessionId: string;
  sequence: number;
  startIndex: number;
  intervalMs: number;
  products: string[];
  layoutMode?: LayoutMode;
  serverTime?: number;
  instanceId?: string;
}

type LayoutMode = 'card' | 'image';

interface RotationEnvelope {
  type: 'init' | 'tick' | 'stop';
  payload: RotationMessage;
}
