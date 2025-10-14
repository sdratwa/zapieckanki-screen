const channelName = 'multiwall::rotation';
const channel = new BroadcastChannel(channelName);

const intervalInput = document.getElementById('interval') as HTMLInputElement;
const productsTextarea = document.getElementById('products') as HTMLTextAreaElement;
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const stateLabel = document.getElementById('stateLabel') as HTMLElement;
const indexLabel = document.getElementById('indexLabel') as HTMLElement;
const productCountLabel = document.getElementById('productCount') as HTMLElement;

const DEFAULT_PRODUCTS = [
  'Produkt 1',
  'Produkt 2',
  'Produkt 3',
  'Produkt 4',
  'Produkt 5',
  'Produkt 6',
  'Produkt 7',
  'Produkt 8',
];

let timer: number | null = null;
let startIndex = 0;

function readProducts(): string[] {
  const lines = productsTextarea.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : [...DEFAULT_PRODUCTS];
}

function composePayload(type: 'init' | 'tick' | 'stop', intervalMs: number, products: string[]) {
  return {
    type,
    ts: performance.now(),
    startIndex,
    intervalMs,
    products,
  } satisfies RotationMessage;
}

function broadcast(type: 'init' | 'tick' | 'stop') {
  const intervalMs = getIntervalMs();
  const products = readProducts();
  const payload = composePayload(type, intervalMs, products);
  channel.postMessage(payload);
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

if (!productsTextarea.value.trim()) {
  productsTextarea.value = DEFAULT_PRODUCTS.join('\n');
  productCountLabel.textContent = DEFAULT_PRODUCTS.length.toString();
}

setStateLabel('Oczekiwanie na start');

// extend types
interface RotationMessage {
  type: 'init' | 'tick' | 'stop';
  ts: number;
  startIndex: number;
  intervalMs: number;
  products: string[];
}
