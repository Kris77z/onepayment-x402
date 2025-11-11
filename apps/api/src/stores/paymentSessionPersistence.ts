import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { PaymentSession } from './paymentSessionTypes.js';

const DATA_DIR = resolve(process.cwd(), 'data');
const DATA_FILE = resolve(DATA_DIR, 'payment-sessions.json');

function ensureDataFile(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, '[]', { encoding: 'utf8' });
  }
}

export function loadSessionsFromDisk(): PaymentSession[] {
  try {
    ensureDataFile();
    const raw = readFileSync(DATA_FILE, { encoding: 'utf8' });
    if (!raw.trim()) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as PaymentSession[];
    }
    return [];
  } catch (error) {
    console.warn('[paymentSessionPersistence] Failed to load sessions from disk:', error);
    return [];
  }
}

export function saveSessionsToDisk(sessions: PaymentSession[]): void {
  ensureDataFile();
  const serialized = JSON.stringify(sessions, null, 2);
  writeFileSync(DATA_FILE, serialized, { encoding: 'utf8' });
}


