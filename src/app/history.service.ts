import { Injectable, signal } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';

export interface HistoryEntry {
  id?: number;
  name: string;
  content: string;
  size: number;
  createdAt: number;
}

interface FormatterDB extends DBSchema {
  history: {
    key: number;
    value: HistoryEntry;
    indexes: { createdAt: number };
  };
}

const MAX_ENTRIES = 50;

/** Stores previously parsed JSON documents in IndexedDB. */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private dbPromise?: Promise<IDBPDatabase<FormatterDB>>;

  private get db(): Promise<IDBPDatabase<FormatterDB>> {
    return (this.dbPromise ??= openDB<FormatterDB>('json-formatter', 1, {
      upgrade(db) {
        const store = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
      },
    }));
  }

  /** Newest first. */
  readonly entries = signal<HistoryEntry[]>([]);

  constructor() {
    if (typeof indexedDB === 'undefined') return; // e.g. unit tests / very old browsers
    this.refresh().catch((e) => console.warn('History unavailable', e));
  }

  async add(content: string, name: string): Promise<void> {
    // Reuse an entry with identical content, or, for documents fetched from a URL, the entry
    // for that URL (so refreshing a URL updates it instead of piling up copies).
    const fromUrl = /^https?:\/\//i.test(name);
    const existing = this.entries().find((e) => e.content === content || (fromUrl && e.name === name));
    const db = await this.db;
    if (existing?.id != null) {
      const size = new Blob([content]).size;
      await db.put('history', { ...existing, name, content, size, createdAt: Date.now() });
    } else {
      await db.add('history', { name, content, size: new Blob([content]).size, createdAt: Date.now() });
    }
    await this.prune(db);
    await this.refresh();
  }

  async remove(id: number): Promise<void> {
    await (await this.db).delete('history', id);
    await this.refresh();
  }

  async clear(): Promise<void> {
    await (await this.db).clear('history');
    await this.refresh();
  }

  private async prune(db: IDBPDatabase<FormatterDB>): Promise<void> {
    const keys = await db.getAllKeysFromIndex('history', 'createdAt');
    const excess = keys.length - MAX_ENTRIES;
    if (excess <= 0) return;
    // getAllKeysFromIndex returns primary keys ordered by createdAt ascending (oldest first).
    const tx = db.transaction('history', 'readwrite');
    await Promise.all([...keys.slice(0, excess).map((k) => tx.store.delete(k)), tx.done]);
  }

  private async refresh(): Promise<void> {
    const all = await (await this.db).getAllFromIndex('history', 'createdAt');
    this.entries.set(all.reverse());
  }
}
