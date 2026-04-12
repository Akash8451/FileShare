import { useState, useEffect, useCallback } from 'react';

const DB_NAME = 'fileshare-history';
const DB_VERSION = 1;
const STORE_NAME = 'transfers';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function useTransferHistory() {
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        // Sort newest first, limit to 50
        const sorted = (req.result || [])
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50);
        setHistory(sorted);
      };
      req.onerror = () => console.error('Failed to load history');
    } catch (e) {
      console.error('IndexedDB error:', e);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const addTransfer = useCallback(async (record) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add({
        ...record,
        timestamp: Date.now(),
      });
      tx.oncomplete = () => loadHistory();
    } catch (e) {
      console.error('Failed to save transfer:', e);
    }
  }, [loadHistory]);

  const clearHistory = useCallback(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => setHistory([]);
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  }, []);

  return { history, addTransfer, clearHistory };
}
