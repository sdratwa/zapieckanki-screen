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

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY as string | undefined;
const PUSHER_ENDPOINT = (import.meta.env.VITE_PUSHER_ENDPOINT as string | undefined) ?? '/trigger';
const useBroadcastFallback = !PUSHER_KEY;
const broadcastChannel = useBroadcastFallback
  ? new BroadcastChannel('multiwall::rotation')
  : null;

type LayoutMode = 'card' | 'image';

let layoutMode: LayoutMode =
  layoutInputs.find((input) => input.checked)?.value === 'image' ? 'image' : 'card';
let sessionId = generateSessionId();
let sequence = 0;

const DEFAULT_CARD_PRODUCTS = [
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
    <img src="/products/Zmiennika.webp" alt="Zmiennika" />
    <figcaption>
      <h2>Zmiennika</h2>
      <p>Zaskakujące połączenie sezonowych dodatków.</p>
    </figcaption>
  </figure>`,
  `<figure class="product-card">
    <img src="/products/CzarPrl.webp" alt="Czar PRL" />
    <figcaption>
      <h2>Czar PRL XL</h2>
      <p>Większa porcja klasyka – idealna na dzielenie.</p>
    </figcaption>
  </figure>`,
];

const DEFAULT_IMAGE_PRODUCTS = [
  `<img class="slide-asset" src="/products/CzarPrl.webp" alt="Czar PRL" />`,
  `<img class="slide-asset" src="/products/Gimbusa.webp" alt="Gimbusa" />`,
  `<img class="slide-asset" src="/products/Zmiennika.webp" alt="Zmiennika" />`,
  `<img class="slide-asset" src="/products/CzarPrl.webp" alt="Czar PRL XL" />`,
];

let timer: number | null = null;
let startIndex = 0;

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

function composePayload(
  type: 'init' | 'tick' | 'stop',
  intervalMs: number,
  products: string[],
) {
  return {
    type,
    ts: performance.now(),
    sessionId,
    sequence: nextSequence(),
    startIndex,
    intervalMs,
    products,
    layoutMode,
  } satisfies RotationMessage;
}

function nextSequence(): number {
  sequence += 1;
  return sequence;
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

function clearTimer() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function scheduleTicks() {
  clearTimer();
  const intervalMs = getIntervalMs();
  timer = window.setInterval(() => {
    const productCount = readProducts().length;
    startIndex = productCount > 0 ? (startIndex + 1) % productCount : 0;
    broadcast('tick');
  }, intervalMs);
}

function handleStart() {
  startIndex = 0;
  broadcast('init');
  scheduleTicks();
  setStateLabel('W trakcie rotacji');
}

function handleStop() {
  clearTimer();
  broadcast('stop');
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
  if (timer !== null) {
    broadcast('init');
    scheduleTicks();
  }
});

productsTextarea.addEventListener('change', () => {
  if (timer !== null) {
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
    if (timer !== null) {
      startIndex = 0;
      broadcast('init');
    }
  });
});

if (!productsTextarea.value.trim()) {
  const defaults = layoutMode === 'image' ? DEFAULT_IMAGE_PRODUCTS : DEFAULT_CARD_PRODUCTS;
  productsTextarea.value = defaults.join('\n\n');
  productCountLabel.textContent = defaults.length.toString();
}

setStateLabel('Oczekiwanie na start');

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
