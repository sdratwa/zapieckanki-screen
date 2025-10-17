import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Pusher from 'pusher';
import * as storage from './storage.js';

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

  const instanceId = payload?.instanceId || 'default';
  const channelName = `rotation-${instanceId}`;
  const serverTime = Date.now();

  try {
    await pusher.trigger(channelName, 'rotation-event', {
      type,
      payload: { ...payload, serverTime },
      ts: serverTime,
    });
    res.json({ ok: true, serverTime });
  } catch (error) {
    console.error('Pusher trigger failed', error);
    res.status(500).json({ error: 'Failed to trigger event' });
  }
});

app.get('/health', (_, res) => {
  res.json({ ok: true });
});

// ==================== INSTANCES API ====================

// GET /api/instances - Get all instances
app.get('/api/instances', async (req, res) => {
  try {
    const instances = await storage.getAllInstances();
    res.json(instances);
  } catch (error) {
    console.error('Failed to get instances:', error);
    res.status(500).json({ error: 'Failed to get instances' });
  }
});

// GET /api/instances/:id - Get single instance
app.get('/api/instances/:id', async (req, res) => {
  try {
    const instance = await storage.getInstance(req.params.id);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    res.json(instance);
  } catch (error) {
    console.error('Failed to get instance:', error);
    res.status(500).json({ error: 'Failed to get instance' });
  }
});

// POST /api/instances - Create new instance
app.post('/api/instances', async (req, res) => {
  try {
    const { id, name } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "id" field' });
    }

    // Validate ID format: only a-z, 0-9, and hyphens
    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ 
        error: 'Invalid ID format. Only lowercase letters (a-z), numbers (0-9), and hyphens (-) are allowed.' 
      });
    }

    const instance = await storage.createInstance({
      id,
      name: name || id.charAt(0).toUpperCase() + id.slice(1),
    });

    res.status(201).json(instance);
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    console.error('Failed to create instance:', error);
    res.status(500).json({ error: 'Failed to create instance' });
  }
});

// PUT /api/instances/:id - Update instance
app.put('/api/instances/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const instance = await storage.updateInstance(req.params.id, { name });
    res.json(instance);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Failed to update instance:', error);
    res.status(500).json({ error: 'Failed to update instance' });
  }
});

// DELETE /api/instances/:id - Delete instance
app.delete('/api/instances/:id', async (req, res) => {
  try {
    await storage.deleteInstance(req.params.id);
    res.json({ ok: true });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Failed to delete instance:', error);
    res.status(500).json({ error: 'Failed to delete instance' });
  }
});

// ==================== CONTROLLER STATE API ====================

// GET /api/instances/:id/state - Get controller state
app.get('/api/instances/:id/state', async (req, res) => {
  try {
    const state = await storage.getControllerState(req.params.id);
    if (!state) {
      return res.status(404).json({ error: 'State not found' });
    }
    res.json(state);
  } catch (error) {
    console.error('Failed to get state:', error);
    res.status(500).json({ error: 'Failed to get state' });
  }
});

// PUT /api/instances/:id/state - Save controller state (DEPRECATED - use /config instead)
app.put('/api/instances/:id/state', async (req, res) => {
  try {
    const { intervalSeconds, products, layoutMode, isRunning } = req.body;

    if (typeof intervalSeconds !== 'number' || typeof products !== 'string' || 
        typeof layoutMode !== 'string' || typeof isRunning !== 'boolean') {
      return res.status(400).json({ error: 'Invalid state data' });
    }

    await storage.saveControllerState(req.params.id, {
      intervalSeconds,
      products,
      layoutMode: layoutMode as 'card' | 'image',
      isRunning,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to save state:', error);
    res.status(500).json({ error: 'Failed to save state' });
  }
});

// ==================== INSTANCE CONFIGURATION API (Ad Groups) ====================

// GET /api/instances/:id/config - Get full instance configuration
app.get('/api/instances/:id/config', async (req, res) => {
  try {
    const config = await storage.getInstanceConfig(req.params.id);
    res.json(config);
  } catch (error) {
    console.error('Failed to get config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// PUT /api/instances/:id/config - Save full instance configuration
app.put('/api/instances/:id/config', async (req, res) => {
  try {
    const { adGroups, screenAssignments } = req.body;

    if (!Array.isArray(adGroups) || typeof screenAssignments !== 'object') {
      return res.status(400).json({ error: 'Invalid configuration data' });
    }

    await storage.saveInstanceConfig(req.params.id, {
      adGroups,
      screenAssignments,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to save config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// POST /api/instances/:id/groups - Create new ad group
app.post('/api/instances/:id/groups', async (req, res) => {
  try {
    const config = await storage.getInstanceConfig(req.params.id);
    const newGroup = req.body;

    // Validate group structure
    if (!newGroup.id || !newGroup.name || !newGroup.type || !Array.isArray(newGroup.products)) {
      return res.status(400).json({ error: 'Invalid group data' });
    }

    // Check if group ID already exists
    if (config.adGroups.find(g => g.id === newGroup.id)) {
      return res.status(409).json({ error: `Group with id "${newGroup.id}" already exists` });
    }

    config.adGroups.push(newGroup);
    await storage.saveInstanceConfig(req.params.id, config);

    res.status(201).json(newGroup);
  } catch (error) {
    console.error('Failed to create group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// PUT /api/instances/:id/groups/:groupId - Update ad group
app.put('/api/instances/:id/groups/:groupId', async (req, res) => {
  try {
    const config = await storage.getInstanceConfig(req.params.id);
    const groupIndex = config.adGroups.findIndex(g => g.id === req.params.groupId);

    if (groupIndex === -1) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Merge updates (preserve id)
    config.adGroups[groupIndex] = {
      ...config.adGroups[groupIndex],
      ...req.body,
      id: req.params.groupId, // Cannot change ID
    };

    await storage.saveInstanceConfig(req.params.id, config);

    res.json(config.adGroups[groupIndex]);
  } catch (error) {
    console.error('Failed to update group:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// DELETE /api/instances/:id/groups/:groupId - Delete ad group
app.delete('/api/instances/:id/groups/:groupId', async (req, res) => {
  try {
    const config = await storage.getInstanceConfig(req.params.id);
    const groupIndex = config.adGroups.findIndex(g => g.id === req.params.groupId);

    if (groupIndex === -1) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Remove group
    config.adGroups.splice(groupIndex, 1);

    // Remove screen assignments pointing to this group
    for (const screenId in config.screenAssignments) {
      if (config.screenAssignments[screenId] === req.params.groupId) {
        delete config.screenAssignments[screenId];
      }
    }

    await storage.saveInstanceConfig(req.params.id, config);

    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Pusher relay listening on port ${PORT}`);
});
