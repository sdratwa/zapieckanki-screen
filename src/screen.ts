const params = new URLSearchParams(window.location.search);
const screenPos = Number.parseInt(params.get('pos') ?? '0', 10) || 0;

const belt = document.getElementById('belt') as HTMLDivElement;
const prevEl = document.getElementById('prev') as HTMLElement;
const currEl = document.getElementById('curr') as HTMLElement;
const nextEl = document.getElementById('next') as HTMLElement;
const badgeEl = document.getElementById('badge') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;

const channelName = 'multiwall::rotation';
const channel = new BroadcastChannel(channelName);

let products: string[] = [];
let startIndex = 0;
let pendingStartIndex: number | null = null;
let isAnimating = false;

const TRANSITION_MS = 700;

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
    return;
  }

  prevEl.innerHTML = products[productIndex(-1, baseStartIndex)] ?? '';
  currEl.innerHTML = products[productIndex(0, baseStartIndex)] ?? '';
  nextEl.innerHTML = products[productIndex(1, baseStartIndex)] ?? '';

  const currentIndex = productIndex(0, baseStartIndex);
  setStatus(`Produkt ${currentIndex + 1} z ${products.length}`);
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

channel.addEventListener('message', (event) => {
  const message = event.data as RotationMessage;
  if (!message) return;

  products = message.products ?? [];
  const incomingStartIndex = message.startIndex ?? 0;

  switch (message.type) {
    case 'init':
      startIndex = products.length > 0 ? normalizeIndex(incomingStartIndex, products.length) : 0;
      pendingStartIndex = null;
      renderSlides();
      snapToCenter();
      setStatus('Zsynchronizowano');
      isAnimating = false;
      break;
    case 'tick':
      renderSlides(startIndex);
      pendingStartIndex = normalizeIndex(incomingStartIndex, products.length);
      requestAnimationFrame(() => {
        if (!isAnimating) {
          animateLeft();
        }
      });
      break;
    case 'stop':
      commitPendingStartIndex();
      renderSlides(startIndex);
      setStatus('Zatrzymano');
      break;
    default:
      break;
  }
});

window.addEventListener('focus', () => setBadge());
setBadge();
snapToCenter();
setStatus('Oczekiwanie na kontroler…');

interface RotationMessage {
  type: 'init' | 'tick' | 'stop';
  ts: number;
  startIndex: number;
  intervalMs: number;
  products: string[];
}
