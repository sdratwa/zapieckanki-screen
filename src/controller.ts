// ==================== INSTANCE MANAGEMENT ====================

interface Instance {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
}

async function getInstance(id: string): Promise<Instance | null> {
  try {
    const response = await fetch(`/api/instances/${id}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      console.error('Failed to fetch instance:', response.statusText);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch instance:', error);
    return null;
  }
}

function getInstanceIdFromURL(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('instance');
}

// Read instanceId from URL
const instanceId = getInstanceIdFromURL();

if (!instanceId) {
  // Redirect to index if no instance specified
  window.location.href = '/';
  throw new Error('No instance specified');
}

// ==================== UI ELEMENTS ====================

const intervalInput = document.getElementById('interval') as HTMLInputElement;
const productsTextarea = document.getElementById('products') as HTMLTextAreaElement;
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const stateLabel = document.getElementById('stateLabel') as HTMLElement;
const indexLabel = document.getElementById('indexLabel') as HTMLElement;
const productCountLabel = document.getElementById('productCount') as HTMLElement;
const layoutInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="layoutMode"]'),
);
const productionModeCheckbox = document.getElementById('productionMode') as HTMLInputElement;

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY as string | undefined;
const PUSHER_ENDPOINT = normalizePusherEndpoint(
  (import.meta.env.VITE_PUSHER_ENDPOINT as string | undefined) ?? '/trigger'
);
const useBroadcastFallback = !PUSHER_KEY;

function normalizePusherEndpoint(url: string): string {
  if (url.startsWith('/')) return url;
  if (window.location.protocol === 'https:' && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}
const broadcastChannel = useBroadcastFallback
  ? new BroadcastChannel('multiwall::rotation')
  : null;

type LayoutMode = 'card' | 'image';

let layoutMode: LayoutMode =
  layoutInputs.find((input) => input.checked)?.value === 'image' ? 'image' : 'card';
let sessionId = generateSessionId();
// Use timestamp as sequence to ensure globally increasing values across controller restarts
let lastSequenceTime = 0;

const DEFAULT_CARD_PRODUCTS = [
  `<figure class="product-card">
    <img src="/products/Aleurwal.webp" alt="Ale urwał" />
    <figcaption>
      <h2>Ale urwał</h2>
      <p>Zapieckanka z charakterem – dla prawdziwych smakoszy.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Baltona.webp" alt="Baltona" />
    <figcaption>
      <h2>Baltona</h2>
      <p>Inspirowana smakami Bałtyku.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Borewicza.webp" alt="Borewicza" />
    <figcaption>
      <h2>Borewicza</h2>
      <p>Dla detektywów dobrego smaku.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/ChytrejBaby.webp" alt="Chytrej Baby" />
    <figcaption>
      <h2>Chytrej Baby</h2>
      <p>Sprytne połączenie sprawdzonych składników.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Cinkciarza.webp" alt="Cinkciarza" />
    <figcaption>
      <h2>Cinkciarza</h2>
      <p>Wyśmienita transakcja smaku.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/CzarPrl.webp" alt="Czar PRL" />
    <figcaption>
      <h2>Czar PRL</h2>
      <p>Zapieckanka z pieczarkami, serem i szczypiorkiem.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Gimbusa.webp" alt="Gimbusa" />
    <figcaption>
      <h2>Gimbusa</h2>
      <p>Młodzieżowa klasyka z keczupem i serem.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Kargula-i-pawlaka.webp" alt="Kargula i Pawlaka" />
    <figcaption>
      <h2>Kargula i Pawlaka</h2>
      <p>Sąsiedzka klasyka – sprawdzona przepisem.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Mirka-Handalrza.webp" alt="Mirka Handlarza" />
    <figcaption>
      <h2>Mirka Handlarza</h2>
      <p>Najlepsza oferta na rynku!</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Pan-tu-nie-stal.webp" alt="Pan tu nie stał" />
    <figcaption>
      <h2>Pan tu nie stał</h2>
      <p>Ale teraz już stoisz – spróbuj!</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Pewex.webp" alt="Pewex" />
    <figcaption>
      <h2>Pewex</h2>
      <p>Premium quality z peerelu.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Popularna.webp" alt="Popularna" />
    <figcaption>
      <h2>Popularna</h2>
      <p>Najbardziej lubiana przez klientów.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Relax.webp" alt="Relax" />
    <figcaption>
      <h2>Relax</h2>
      <p>Odprężająca kompozycja smaków.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/Zmiennika.webp" alt="Zmiennika" />
    <figcaption>
      <h2>Zmiennika</h2>
      <p>Zaskakujące połączenie sezonowych dodatków.</p>
    </figcaption>
  </figure>`,
];

const DEFAULT_IMAGE_PRODUCTS = [
  `<img class="slide-asset" src="/products/Aleurwal.webp" alt="Ale urwał" />`,
  `<img class="slide-asset" src="/products/Baltona.webp" alt="Baltona" />`,
  `<img class="slide-asset" src="/products/Borewicza.webp" alt="Borewicza" />`,
  `<img class="slide-asset" src="/products/ChytrejBaby.webp" alt="Chytrej Baby" />`,
  `<img class="slide-asset" src="/products/Cinkciarza.webp" alt="Cinkciarza" />`,
  `<img class="slide-asset" src="/products/CzarPrl.webp" alt="Czar PRL" />`,
  `<img class="slide-asset" src="/products/Gimbusa.webp" alt="Gimbusa" />`,
  `<img class="slide-asset" src="/products/Kargula-i-pawlaka.webp" alt="Kargula i Pawlaka" />`,
  `<img class="slide-asset" src="/products/Mirka-Handalrza.webp" alt="Mirka Handlarza" />`,
  `<img class="slide-asset" src="/products/Pan-tu-nie-stal.webp" alt="Pan tu nie stał" />`,
  `<img class="slide-asset" src="/products/Pewex.webp" alt="Pewex" />`,
  `<img class="slide-asset" src="/products/Popularna.webp" alt="Popularna" />`,
  `<img class="slide-asset" src="/products/Relax.webp" alt="Relax" />`,
  `<img class="slide-asset" src="/products/Zmiennika.webp" alt="Zmiennika" />`,
];

let startIndex = 0;
let isRunning = false;

// ==================== STATE PERSISTENCE ====================

interface ControllerState {
  intervalSeconds: number;
  products: string;
  layoutMode: LayoutMode;
  isRunning: boolean;
  productionMode: boolean;
}

async function saveState() {
  const state: ControllerState = {
    intervalSeconds: Number.parseInt(intervalInput.value, 10) || 10,
    products: productsTextarea.value,
    layoutMode,
    isRunning,
    productionMode: productionModeCheckbox.checked,
  };

  try {
    const response = await fetch(`/api/instances/${instanceId}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      console.error('Failed to save state:', response.statusText);
    }
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

async function loadState(): Promise<ControllerState | null> {
  try {
    const response = await fetch(`/api/instances/${instanceId}/state`);
    
    if (response.status === 404) {
      // State not found, return null (will use defaults)
      return null;
    }

    if (!response.ok) {
      console.error('Failed to load state:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to load state:', error);
    return null;
  }
}

async function sendToPusher(message: OutgoingMessage) {
  try {
    const response = await fetch(PUSHER_ENDPOINT!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Relay responded with ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to send Pusher message', error);
    setStateLabel('Błąd wysyłki do serwera');
  }
}

function readProducts(): string[] {
  const raw = productsTextarea.value;
  const normalized = raw.replace(/\r\n/g, '\n');
  const blocks = normalized
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length > 1) {
    return blocks;
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const defaults = layoutMode === 'image' ? DEFAULT_IMAGE_PRODUCTS : DEFAULT_CARD_PRODUCTS;

  return blocks.length ? blocks : lines.length ? lines : [...defaults];
}

function extractImagesFromProducts(products: string[]): string[] {
  return products.map((product) => {
    // If it's already just an <img> tag, return as is
    if (product.trim().match(/^<img\s/i)) {
      return product;
    }
    
    // Extract <img> from HTML (e.g., from <figure>)
    const imgMatch = product.match(/<img[^>]*>/i);
    if (imgMatch) {
      return imgMatch[0];
    }
    
    // If no <img> found, return original
    return product;
  });
}

function composePayload(
  type: 'init' | 'tick' | 'stop',
  intervalMs: number,
  products: string[],
) {
  // In image mode, extract only <img> tags from HTML blocks
  const processedProducts = layoutMode === 'image' 
    ? extractImagesFromProducts(products) 
    : products;

  return {
    type,
    ts: performance.now(),
    sessionId,
    sequence: nextSequence(),
    startIndex,
    intervalMs,
    products: processedProducts,
    layoutMode,
    instanceId,
    productionMode: productionModeCheckbox.checked,
  } satisfies RotationMessage;
}

function nextSequence(): number {
  // Use timestamp (ms) as sequence to ensure globally increasing values
  // Even if controller is closed and reopened, sequence will always be higher
  const now = Date.now();
  if (now <= lastSequenceTime) {
    // Prevent duplicate timestamps (in case of very fast consecutive calls)
    lastSequenceTime += 1;
  } else {
    lastSequenceTime = now;
  }
  return lastSequenceTime;
}

function broadcast(type: 'init' | 'tick' | 'stop') {
  const intervalMs = getIntervalMs();
  const products = readProducts();
  const payload = composePayload(type, intervalMs, products);
  if (useBroadcastFallback && broadcastChannel) {
    broadcastChannel.postMessage(payload);
  } else {
    void sendToPusher({ type, payload });
  }
  productCountLabel.textContent = products.length.toString();
  indexLabel.textContent = startIndex.toString();
}

function getIntervalMs(): number {
  const seconds = Number.parseInt(intervalInput.value, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 10000;
}

function setStateLabel(text: string) {
  stateLabel.textContent = text;
}

function handleStart() {
  startIndex = 0;
  isRunning = true;
  broadcast('init');
  saveState();
  setStateLabel('W trakcie rotacji (ekrany działają autonomicznie)');
}

function handleStop() {
  isRunning = false;
  broadcast('stop');
  saveState();
  setStateLabel('Zatrzymano');
}

function handleReset() {
  startIndex = 0;
  broadcast('init');
  setStateLabel('Zresetowano indeks');
}

startBtn.addEventListener('click', handleStart);
stopBtn.addEventListener('click', handleStop);
resetBtn.addEventListener('click', handleReset);

intervalInput.addEventListener('change', () => {
  saveState();
  syncToControllers(); // Sync to other controllers
  if (isRunning) {
    broadcast('init');
  }
});

productsTextarea.addEventListener('change', () => {
  saveState();
  syncToControllers(); // Sync to other controllers
  if (isRunning) {
    broadcast('init');
  }
});

layoutInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    layoutMode = input.value === 'image' ? 'image' : 'card';
    const defaults = layoutMode === 'image' ? DEFAULT_IMAGE_PRODUCTS : DEFAULT_CARD_PRODUCTS;
    if (!productsTextarea.value.trim()) {
      productsTextarea.value = defaults.join('\n\n');
    }
    productCountLabel.textContent = readProducts().length.toString();
    saveState();
    syncToControllers(); // Sync to other controllers
    if (isRunning) {
      startIndex = 0;
      broadcast('init');
    }
  });
});

productionModeCheckbox.addEventListener('change', () => {
  saveState();
  syncToControllers(); // Sync to other controllers
  if (isRunning) {
    broadcast('init');
  }
});

// Load saved state or use defaults
(async () => {
  const savedState = await loadState();
  if (savedState) {
    intervalInput.value = savedState.intervalSeconds.toString();
    productsTextarea.value = savedState.products;
    layoutMode = savedState.layoutMode;
    isRunning = savedState.isRunning;
    productionModeCheckbox.checked = savedState.productionMode ?? false;
    
    // Update layout radio buttons
    layoutInputs.forEach((input) => {
      input.checked = input.value === layoutMode;
    });
    
    productCountLabel.textContent = readProducts().length.toString();
    setStateLabel(isRunning ? 'W trakcie rotacji (ekrany działają autonomicznie)' : 'Oczekiwanie na start');
  } else {
    if (!productsTextarea.value.trim()) {
      const defaults = layoutMode === 'image' ? DEFAULT_IMAGE_PRODUCTS : DEFAULT_CARD_PRODUCTS;
      productsTextarea.value = defaults.join('\n\n');
      productCountLabel.textContent = defaults.length.toString();
    }
    setStateLabel('Oczekiwanie na start');
  }
})();

// Display instance info
(async () => {
  const instanceNameEl = document.getElementById('instanceName');
  if (instanceNameEl) {
    const currentInstance = await getInstance(instanceId);
    if (currentInstance) {
      instanceNameEl.textContent = currentInstance.name;
    } else {
      instanceNameEl.textContent = instanceId;
      console.warn(`Instance "${instanceId}" not found in backend. You may need to create it in the launcher.`);
    }
  }
})();

// Screen launcher
const screenPosInput = document.getElementById('screenPos') as HTMLInputElement;

(window as any).adjustScreenPos = (delta: number) => {
  if (!screenPosInput) return;
  const currentValue = parseInt(screenPosInput.value, 10) || 0;
  const newValue = Math.max(0, Math.min(99, currentValue + delta));
  screenPosInput.value = newValue.toString();
};

(window as any).openScreenWindow = () => {
  const pos = screenPosInput ? parseInt(screenPosInput.value, 10) || 0 : 0;
  window.open(`/screen.html?instance=${instanceId}&pos=${pos}`, '_blank');
};

// ==================== CONTROLLER SYNCHRONIZATION ====================

let lastSyncSequence = -1;

function syncToControllers() {
  // Send controller-sync event to other controllers via Pusher
  const intervalMs = getIntervalMs();
  const products = readProducts();

  const syncPayload = {
    type: 'controller-sync' as const,
    payload: {
      type: 'controller-sync' as const,
      ts: performance.now(),
      sessionId,
      sequence: nextSequence(),
      startIndex,
      intervalMs,
      products,
      layoutMode,
      instanceId,
      productionMode: productionModeCheckbox.checked,
    },
  };

  if (useBroadcastFallback) {
    // BroadcastChannel fallback (same device only)
    channel?.postMessage(syncPayload.payload);
  } else {
    // Pusher (cross-device)
    void sendToPusher(syncPayload);
  }
}

async function setupRealtimeSync() {
  if (useBroadcastFallback || !PUSHER_KEY) {
    console.log('Pusher not configured - controller sync disabled');
    return;
  }

  try {
    const { default: Pusher } = await import('pusher-js');
    const pusher = new Pusher(PUSHER_KEY, {
      cluster: import.meta.env.VITE_PUSHER_CLUSTER as string,
      forceTLS: true,
    });

    const channelName = `rotation-${instanceId}`;
    const subscription = pusher.subscribe(channelName);

    subscription.bind('rotation-event', (data: { type: string; payload: RotationMessage }) => {
      // Only process controller-sync events, ignore screen events (init/stop)
      if (data.type !== 'controller-sync') return;

      const message = data.payload;

      // Ignore our own messages
      if (message.sessionId === sessionId) return;

      // Ignore old messages
      if (typeof message.sequence === 'number' && message.sequence <= lastSyncSequence) {
        return;
      }

      lastSyncSequence = message.sequence ?? lastSyncSequence;

      console.log(`🔄 Syncing from another controller (session: ${message.sessionId.slice(0, 8)}...)`);

      // Update UI with synced values
      if (message.intervalMs) {
        intervalInput.value = Math.floor(message.intervalMs / 1000).toString();
      }

      if (message.products) {
        productsTextarea.value = message.products.join('\n\n');
        productCountLabel.textContent = message.products.length.toString();
      }

      if (message.layoutMode) {
        layoutMode = message.layoutMode;
        layoutInputs.forEach((input) => {
          input.checked = input.value === layoutMode;
        });
      }

      if (message.productionMode !== undefined) {
        productionModeCheckbox.checked = message.productionMode;
      }

      // Optionally update isRunning state
      // (we don't update START/STOP buttons to avoid confusion)
    });

    console.log('✅ Controller sync enabled via Pusher');
  } catch (error) {
    console.error('Failed to setup controller sync:', error);
  }
}

// Initialize controller sync
void setupRealtimeSync();

// extend types
interface RotationMessage {
  type: 'init' | 'tick' | 'stop';
  ts: number;
  sessionId: string;
  sequence: number;
  startIndex: number;
  intervalMs: number;
  products: string[];
  layoutMode: LayoutMode;
  instanceId: string;
  productionMode?: boolean;
}

interface OutgoingMessage {
  type: 'init' | 'tick' | 'stop';
  payload: RotationMessage;
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

interface OutgoingMessage {
  type: 'init' | 'tick' | 'stop';
  payload: RotationMessage;
}
