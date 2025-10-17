import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const INSTANCES_FILE = path.join(DATA_DIR, 'instances.json');
const STATES_DIR = path.join(DATA_DIR, 'states');
const CONFIGS_DIR = path.join(DATA_DIR, 'configs');

// ==================== TYPES ====================

export interface Instance {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
}

// ==================== AD GROUPS (New Architecture) ====================

export interface AdGroup {
  id: string;
  name: string;
  type: 'carousel' | 'static';
  products: string[];
  layoutMode: 'card' | 'image';
  productionMode: boolean;
  intervalSeconds?: number; // Only for carousel type
  isRunning?: boolean; // Runtime state (not persisted in config)
}

export interface InstanceConfig {
  adGroups: AdGroup[];
  screenAssignments: Record<string, string>; // screenId -> adGroupId (e.g. "0" -> "products")
}

// ==================== DEPRECATED (kept for backward compatibility) ====================

export interface ControllerState {
  intervalSeconds: number;
  products: string;
  layoutMode: 'card' | 'image';
  isRunning: boolean;
  productionMode?: boolean;
}

// ==================== INITIALIZATION ====================

async function ensureDataDirs() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(STATES_DIR, { recursive: true });
    await fs.mkdir(CONFIGS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create data directories:', error);
    throw error;
  }
}

async function ensureInstancesFile() {
  try {
    await fs.access(INSTANCES_FILE);
  } catch {
    // File doesn't exist, create it with empty array
    await fs.writeFile(INSTANCES_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

// ==================== INSTANCES ====================

export async function getAllInstances(): Promise<Instance[]> {
  await ensureDataDirs();
  await ensureInstancesFile();

  try {
    const data = await fs.readFile(INSTANCES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to read instances:', error);
    return [];
  }
}

export async function getInstance(id: string): Promise<Instance | null> {
  const instances = await getAllInstances();
  return instances.find((i) => i.id === id) || null;
}

export async function createInstance(instance: Omit<Instance, 'createdAt' | 'updatedAt'>): Promise<Instance> {
  await ensureDataDirs();
  await ensureInstancesFile();

  const instances = await getAllInstances();

  // Check if instance already exists
  if (instances.find((i) => i.id === instance.id)) {
    throw new Error(`Instance with id "${instance.id}" already exists`);
  }

  const newInstance: Instance = {
    ...instance,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  instances.push(newInstance);
  await fs.writeFile(INSTANCES_FILE, JSON.stringify(instances, null, 2), 'utf-8');

  return newInstance;
}

export async function updateInstance(id: string, updates: Partial<Omit<Instance, 'id' | 'createdAt'>>): Promise<Instance> {
  await ensureDataDirs();
  await ensureInstancesFile();

  const instances = await getAllInstances();
  const index = instances.findIndex((i) => i.id === id);

  if (index === -1) {
    throw new Error(`Instance with id "${id}" not found`);
  }

  instances[index] = {
    ...instances[index],
    ...updates,
    updatedAt: Date.now(),
  };

  await fs.writeFile(INSTANCES_FILE, JSON.stringify(instances, null, 2), 'utf-8');

  return instances[index];
}

export async function deleteInstance(id: string): Promise<void> {
  await ensureDataDirs();
  await ensureInstancesFile();

  const instances = await getAllInstances();
  const filtered = instances.filter((i) => i.id !== id);

  if (filtered.length === instances.length) {
    throw new Error(`Instance with id "${id}" not found`);
  }

  await fs.writeFile(INSTANCES_FILE, JSON.stringify(filtered, null, 2), 'utf-8');

  // Also delete state file if exists
  try {
    await fs.unlink(path.join(STATES_DIR, `${id}.json`));
  } catch {
    // State file doesn't exist, ignore
  }
}

// ==================== CONTROLLER STATE ====================

export async function getControllerState(instanceId: string): Promise<ControllerState | null> {
  await ensureDataDirs();

  const stateFile = path.join(STATES_DIR, `${instanceId}.json`);

  try {
    const data = await fs.readFile(stateFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveControllerState(instanceId: string, state: ControllerState): Promise<void> {
  await ensureDataDirs();

  const stateFile = path.join(STATES_DIR, `${instanceId}.json`);

  try {
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to save state for instance ${instanceId}:`, error);
    throw error;
  }
}

// ==================== INSTANCE CONFIGURATION (Ad Groups) ====================

const DEFAULT_PRODUCTS = [
  '<img src="/products/CzarPrl.webp" alt="Czar PRL" />',
  '<img src="/products/Pewex.webp" alt="Pewex" />',
  '<img src="/products/Aleurwal.webp" alt="Ale urwał" />',
  '<img src="/products/Baltona.webp" alt="Baltona" />',
  '<img src="/products/Borewicza.webp" alt="Borewicza" />',
  '<img src="/products/Chytrejaroslawa.webp" alt="Chytre Jarosława" />',
  '<img src="/products/Cinkciarza.webp" alt="Cinkciarza" />',
  '<img src="/products/Gimbusa.webp" alt="Gimbusa" />',
  '<img src="/products/Janusza.webp" alt="Janusza" />',
  '<img src="/products/Kowalskiego.webp" alt="Kowalskiego" />',
  '<img src="/products/Kulfonu.webp" alt="Kulfonu" />',
  '<img src="/products/Mistrzaparku.webp" alt="Mistrza Parku" />',
  '<img src="/products/Mistrzyni.webp" alt="Mistrzyni" />',
  '<img src="/products/Zmiennika.webp" alt="Zmiennika" />',
];

function createDefaultConfig(): InstanceConfig {
  return {
    adGroups: [
      {
        id: 'default-products',
        name: 'Produkty',
        type: 'carousel',
        products: DEFAULT_PRODUCTS,
        layoutMode: 'image',
        productionMode: true,
        intervalSeconds: 10,
      },
    ],
    screenAssignments: {
      '0': 'default-products',
      '1': 'default-products',
      '2': 'default-products',
    },
  };
}

export async function getInstanceConfig(instanceId: string): Promise<InstanceConfig> {
  await ensureDataDirs();

  const configFile = path.join(CONFIGS_DIR, `${instanceId}.json`);

  try {
    const data = await fs.readFile(configFile, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    // Config doesn't exist, create default one
    if (error.code === 'ENOENT') {
      const defaultConfig = createDefaultConfig();
      await saveInstanceConfig(instanceId, defaultConfig);
      return defaultConfig;
    }
    throw error;
  }
}

export async function saveInstanceConfig(instanceId: string, config: InstanceConfig): Promise<void> {
  await ensureDataDirs();

  const configFile = path.join(CONFIGS_DIR, `${instanceId}.json`);

  try {
    await fs.writeFile(configFile, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to save config for instance ${instanceId}:`, error);
    throw error;
  }
}

