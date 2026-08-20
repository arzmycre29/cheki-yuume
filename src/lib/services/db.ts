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
				const res = (req.result as SessionData[]) || [];
				res.forEach((s) => {
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
				});
				res.sort((a, b) => b.createdAt - a.createdAt);
				resolve(res);
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

/**
 * Exports all photos, BTS videos, photostrip, videostrip, and manifest as a ZIP package
 */
export async function createSessionExportZip(session: SessionData): Promise<Blob> {
	const zip = new JSZip();
	const folder = zip.folder(session.sessionId) || zip;

	// 1. Raw Photos
	const photosFolder = folder.folder('raw_photos');
	for (let i = 0; i < session.photos.length; i++) {
		const p = session.photos[i];
		if (p.dataUrl) {
			const base64Data = p.dataUrl.split(',')[1];
			photosFolder?.file(`photo_${i + 1}.jpg`, base64Data, { base64: true });
		}
	}

	// 2. BTS Videos
	const btsFolder = folder.folder('bts_videos');
	for (let i = 0; i < session.photos.length; i++) {
		const p = session.photos[i];
		if (p.btsVideoBlob) {
			btsFolder?.file(`bts_${i + 1}.webm`, p.btsVideoBlob);
		}
	}

	// 3. Final Photostrip
	if (session.photostripBlob) {
		folder.file('photostrip.png', session.photostripBlob);
	} else if (session.photostripDataUrl) {
		const base64Data = session.photostripDataUrl.split(',')[1];
		folder.file('photostrip.png', base64Data, { base64: true });
	}

	// 4. Final Videostrip
	if (session.videostripBlob) {
		folder.file('videostrip.mp4', session.videostripBlob);
	}

	// 5. Manifest metadata
	const manifest = {
		sessionId: session.sessionId,
		guestName: session.guestName,
		mode: session.mode,
		layoutId: session.layoutId,
		createdAt: new Date(session.createdAt).toISOString(),
		totalPhotos: session.photos.length,
		printCount: session.printCount,
		cloudShareUrl: session.cloudShareUrl
	};
	folder.file('manifest.json', JSON.stringify(manifest, null, 2));

	return await zip.generateAsync({ type: 'blob' });
}
