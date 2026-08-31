import type { SessionData } from '$lib/types';
import JSZip from 'jszip';

const DB_NAME = 'ChekiYuumeDB';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_SETTINGS = 'settings';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof window === 'undefined' || !window.indexedDB) {
			return reject(new Error('IndexedDB not supported'));
		}
		const request = window.indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
				const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'sessionId' });
				store.createIndex('createdAt', 'createdAt', { unique: false });
				store.createIndex('guestName', 'guestName', { unique: false });
			}
			if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
				db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function saveSessionToDB(session: SessionData): Promise<void> {
	try {
		if (!session || !session.sessionId || typeof session.sessionId !== 'string' || !session.sessionId.trim()) {
			console.warn('[DB] Ignored attempt to save session with missing or empty sessionId.');
			return;
		}
		const db = await openDB();
		const tx = db.transaction(STORE_SESSIONS, 'readwrite');
		const store = tx.objectStore(STORE_SESSIONS);
		await new Promise<void>((resolve, reject) => {
			const req = store.put(session);
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	} catch (err) {
		console.error('[DB] Failed to save session:', err);
	}
}

export async function getSessionFromDB(sessionId: string): Promise<SessionData | null> {
	try {
		if (!sessionId || !sessionId.trim()) return null;
		const db = await openDB();
		const tx = db.transaction(STORE_SESSIONS, 'readonly');
		const store = tx.objectStore(STORE_SESSIONS);
		return await new Promise<SessionData | null>((resolve, reject) => {
			const req = store.get(sessionId);
			req.onsuccess = () => {
				const session = req.result as SessionData | null;
				if (session) {
					if (session.videostripBlob && !session.videostripUrl) {
						session.videostripUrl = URL.createObjectURL(session.videostripBlob);
					}
					if (session.photos) {
						session.photos.forEach((p) => {
							if (p.btsVideoBlob && !p.btsVideoUrl) {
								p.btsVideoUrl = URL.createObjectURL(p.btsVideoBlob);
							}
						});
					}
				}
				resolve(session);
			};
			req.onerror = () => reject(req.error);
		});
	} catch (err) {
		console.error('[DB] Failed to get session:', err);
		return null;
	}
}

export async function getAllSessionsFromDB(): Promise<SessionData[]> {
	try {
		const db = await openDB();
		const tx = db.transaction(STORE_SESSIONS, 'readonly');
		const store = tx.objectStore(STORE_SESSIONS);
		return await new Promise<SessionData[]>((resolve, reject) => {
			const req = store.getAll();
			req.onsuccess = () => {
				const raw = (req.result as SessionData[]) || [];
				const valid: SessionData[] = [];
				for (const s of raw) {
					// Auto purge ghost records with empty/invalid sessionId
					if (!s || !s.sessionId || typeof s.sessionId !== 'string' || !s.sessionId.trim()) {
						if (s && typeof s.sessionId === 'string') {
							deleteSessionFromDB(s.sessionId).catch(() => {});
						}
						continue;
					}
					if (s.videostripBlob && !s.videostripUrl) {
						s.videostripUrl = URL.createObjectURL(s.videostripBlob);
					}
					if (s.photos) {
						s.photos.forEach((p) => {
							if (p.btsVideoBlob && !p.btsVideoUrl) {
								p.btsVideoUrl = URL.createObjectURL(p.btsVideoBlob);
							}
						});
					}
					valid.push(s);
				}
				valid.sort((a, b) => b.createdAt - a.createdAt);
				resolve(valid);
			};
			req.onerror = () => reject(req.error);
		});
	} catch (err) {
		console.error('[DB] Failed to get all sessions:', err);
		return [];
	}
}

export async function deleteSessionFromDB(sessionId: string): Promise<void> {
	try {
		const db = await openDB();
		const tx = db.transaction(STORE_SESSIONS, 'readwrite');
		const store = tx.objectStore(STORE_SESSIONS);
		await new Promise<void>((resolve, reject) => {
			const req = store.delete(sessionId);
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	} catch (err) {
		console.error('[DB] Failed to delete session:', err);
	}
}

export async function deleteMultipleSessionsFromDB(sessionIds: string[]): Promise<void> {
	try {
		const db = await openDB();
		const tx = db.transaction(STORE_SESSIONS, 'readwrite');
		const store = tx.objectStore(STORE_SESSIONS);
		for (const id of sessionIds) {
			store.delete(id);
		}
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} catch (err) {
		console.error('[DB] Failed to delete multiple sessions:', err);
	}
}

export async function deleteAllSessionsFromDB(): Promise<void> {
	try {
		const db = await openDB();
		const tx = db.transaction(STORE_SESSIONS, 'readwrite');
		const store = tx.objectStore(STORE_SESSIONS);
		await new Promise<void>((resolve, reject) => {
			const req = store.clear();
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	} catch (err) {
		console.error('[DB] Failed to clear all sessions:', err);
	}
}

/**
 * Asynchronously resolves media source (base64 DataURL, Blob, or remote HTTP/HTTPS/blob URL)
 * into a binary format ready for JSZip packaging without producing 0-byte corrupt entries.
 */
async function resolveMediaToBinary(
	source: string | Blob | undefined | null
): Promise<Blob | Uint8Array | null> {
	if (!source) return null;
	if (source instanceof Blob) return source;

	if (typeof source === 'string') {
		const trimmed = source.trim();
		if (trimmed.startsWith('data:')) {
			const commaIdx = trimmed.indexOf(',');
			if (commaIdx !== -1) {
				const base64 = trimmed.substring(commaIdx + 1);
				const binaryStr = atob(base64);
				const len = binaryStr.length;
				const bytes = new Uint8Array(len);
				for (let i = 0; i < len; i++) {
					bytes[i] = binaryStr.charCodeAt(i);
				}
				return bytes;
			}
		} else if (
			trimmed.startsWith('http://') ||
			trimmed.startsWith('https://') ||
			trimmed.startsWith('blob:')
		) {
			try {
				const res = await fetch(trimmed, { cache: 'no-cache' });
				if (res.ok) {
					return await res.blob();
				}
			} catch (err) {
				console.warn('[ZIP] Failed to fetch remote media for export:', trimmed, err);
			}
		}
	}
	return null;
}

/**
 * Exports single session photostrip, videostrip, and manifest as a lightweight ZIP package
 */
export async function createSessionExportZip(session: SessionData): Promise<Blob> {
	return createBatchSessionExportZip([session]);
}

/**
 * Exports multiple sessions into a unified, lightweight ZIP archive organized by session folder.
 * Includes photostrip.png, videostrip.mp4 (if present), and manifest.json.
 */
export async function createBatchSessionExportZip(sessions: SessionData[]): Promise<Blob> {
	const zip = new JSZip();

	for (const session of sessions) {
		const folder = zip.folder(session.sessionId) || zip;

		// 1. Final Photostrip (.png)
		const photostripSource =
			session.photostripBlob || session.photostripDataUrl || session.cloudPhotoUrl;
		if (photostripSource) {
			const photostripBinary = await resolveMediaToBinary(photostripSource);
			if (photostripBinary) {
				folder.file('photostrip.png', photostripBinary);
			}
		}

		// 2. Final Videostrip (.mp4) (if available)
		const videoSource =
			session.videostripBlob || session.videostripUrl || session.cloudVideoUrl;
		if (videoSource) {
			const videoBinary = await resolveMediaToBinary(videoSource);
			if (videoBinary) {
				folder.file('videostrip.mp4', videoBinary);
			}
		}

		// 3. Manifest metadata (.json)
		const manifest = {
			sessionId: session.sessionId,
			guestName: session.guestName,
			mode: session.mode,
			layoutId: session.layoutId,
			createdAt: new Date(session.createdAt).toISOString(),
			totalPhotos: session.photos?.length || session.photosCount || 4,
			printCount: session.printCount || 0,
			cloudShareUrl: session.cloudShareUrl || null
		};
		folder.file('manifest.json', JSON.stringify(manifest, null, 2));
	}

	return await zip.generateAsync({ type: 'blob' });
}
