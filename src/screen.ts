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

const TRANSITION_MS = 700;

function setBadge() {
  badgeEl.textContent = `Screen #${screenPos}`;
}

function setStatus(text: string) {
  statusEl.textContent = text;
}

function productIndex(offset: number): number {
  const length = products.length;
  if (length === 0) return 0;
  const index = (startIndex + screenPos + offset) % length;
  return index < 0 ? index + length : index;
}

function renderSlides() {
  if (products.length === 0) {
    prevEl.innerHTML = '';
    currEl.innerHTML = '<em>Brak produktów</em>';
    nextEl.innerHTML = '';
    setStatus('Oczekiwanie na kontroler…');
    return;
  }

  prevEl.innerHTML = products[productIndex(-1)] ?? '';
  currEl.innerHTML = products[productIndex(0)] ?? '';
  nextEl.innerHTML = products[productIndex(1)] ?? '';

  setStatus(`Produkt ${(productIndex(0) + 1)} z ${products.length}`);
}

function snapToCenter() {
  belt.style.transition = 'none';
  belt.style.transform = 'translateX(-100vw)';
  void belt.offsetWidth;
  belt.style.transition = `transform ${TRANSITION_MS}ms ease`;
}

function animateLeft() {
  belt.style.transform = 'translateX(-200vw)';
  const onDone = () => {
    belt.removeEventListener('transitionend', onDone);
    renderSlides();
    snapToCenter();
  };
  belt.addEventListener('transitionend', onDone);
}

channel.addEventListener('message', (event) => {
  const message = event.data as RotationMessage;
  if (!message) return;

  products = message.products ?? [];
  startIndex = message.startIndex ?? 0;

  switch (message.type) {
    case 'init':
      renderSlides();
      snapToCenter();
      setStatus('Zsynchronizowano');
      break;
    case 'tick':
      requestAnimationFrame(() => {
        renderSlides();
        animateLeft();
      });
      break;
    case 'stop':
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
