import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Pusher from 'pusher';

const app = express();
app.use(cors());
app.use(express.json());

const {
  PUSHER_APP_ID,
  PUSHER_KEY,
  PUSHER_SECRET,
  PUSHER_CLUSTER,
  PORT = '3000',
} = process.env;

if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
  throw new Error('Missing Pusher environment variables.');
}

const pusher = new Pusher({
  appId: PUSHER_APP_ID,
  key: PUSHER_KEY,
  secret: PUSHER_SECRET,
  cluster: PUSHER_CLUSTER,
  useTLS: true,
});

app.post('/trigger', async (req, res) => {
  const { type, payload } = req.body || {};
  if (!type) {
    return res.status(400).json({ error: 'Missing message type' });
  }
  try {
    await pusher.trigger('rotation-channel', 'rotation-event', {
      type,
      payload,
      ts: Date.now(),
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Pusher trigger failed', error);
    res.status(500).json({ error: 'Failed to trigger event' });
  }
});

app.get('/health', (_, res) => {
  res.json({ ok: true });
});

app.listen(Number(PORT), () => {
  console.log(`Pusher relay listening on port ${PORT}`);
});
