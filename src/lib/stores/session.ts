import { writable, get } from 'svelte/store';
import type { SessionData, CaptureMode, PhotoItem } from '$lib/types';
import { saveSessionToDB } from '$lib/services/db';
import { getLayoutById } from '$lib/config/frameLayouts';

const SESSION_STORAGE_KEY = 'chekiyuume_active_session';

export function generateSessionId(): string {
	const now = new Date();
	const pad = (n: number) => n.toString().padStart(2, '0');
	const y = now.getFullYear();
	const m = pad(now.getMonth() + 1);
	const d = pad(now.getDate());
	const h = pad(now.getHours());
	const min = pad(now.getMinutes());
	const s = pad(now.getSeconds());
	const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
	return `CKY-${y}${m}${d}-${h}${min}${s}-${rand}`;
}

const initialSession: SessionData = {
	sessionId: '',
	guestName: '',
	createdAt: Date.now(),
	mode: 'default',
	layoutId: 'default-4-classic',
	photos: [],
	assignedSlotPhotoIds: [],
	photostripDataUrl: null,
	photostripBlob: null,
	videostripBlob: null,
	videostripUrl: null,
	printCount: 0,
	cloudUploadStatus: 'idle',
	cloudPhotoUrl: null,
	cloudVideoUrl: null,
	cloudShareUrl: null,
	isOfflineSaved: false
};

function loadStoredSession(): SessionData {
	if (typeof window === 'undefined') return { ...initialSession };
	try {
		const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && parsed.sessionId) {
				return { ...initialSession, ...parsed };
			}
		}
	} catch (e) {
		console.warn('[Session] Failed to load session from storage', e);
	}
	return { ...initialSession };
}

function persistToSessionStorage(session: SessionData) {
	if (typeof window === 'undefined') return;
	try {
		// Only persist lightweight metadata to prevent quota crashes
		const persistable = {
			sessionId: session.sessionId,
			guestName: session.guestName,
			createdAt: session.createdAt,
			mode: session.mode,
			layoutId: session.layoutId,
			assignedSlotPhotoIds: session.assignedSlotPhotoIds,
			printCount: session.printCount
		};
		sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persistable));
	} catch (e) {
		console.warn('[Session] Failed to save session metadata to sessionStorage', e);
	}
}

function createSessionStore() {
	const { subscribe, set, update } = writable<SessionData>(loadStoredSession());

	return {
		subscribe,
		hydrate: () => {
			let current: SessionData = initialSession;
			update((s) => {
				current = s;
				return s;
			});
			if (current.sessionId && current.photos.length > 0) {
				return current;
			}
			const stored = loadStoredSession();
			if (stored.sessionId) {
				const merged = { ...stored, photos: current.photos };
				set(merged);
				return merged;
			}
			return current;
		},
		initNewSession: (mode: CaptureMode = 'default', guestName: string = '', layoutId?: string) => {
			const id = generateSessionId();
			const finalLayoutId = layoutId || (mode === 'default' ? 'default-4-classic' : 'creative-4-midnight');
			const layout = getLayoutById(finalLayoutId);
			const newSession: SessionData = {
				...initialSession,
				sessionId: id,
				guestName: guestName.trim() || `Tamu-${id.slice(-4)}`,
				createdAt: Date.now(),
				mode,
				layoutId: finalLayoutId,
				photos: [],
				assignedSlotPhotoIds: new Array(layout.totalSlots).fill(null)
			};
			set(newSession);
			persistToSessionStorage(newSession);
			// Do NOT save uncompleted sessions to IndexedDB here!
			return newSession;
		},
		setGuestName: (name: string) => {
			update((s) => {
				const updated = { ...s, guestName: name.trim() || s.guestName };
				persistToSessionStorage(updated);
				return updated;
			});
		},
		setLayout: (layoutId: string, slotCount?: number) => {
			update((s) => {
				const layout = getLayoutById(layoutId);
				const count = slotCount || layout.totalSlots || 4;
				const newAssigned: (string | null)[] = new Array(count).fill(null);
				// Populate slots with existing assigned or available photos up to count
				for (let i = 0; i < count; i++) {
					if (s.assignedSlotPhotoIds && s.assignedSlotPhotoIds[i]) {
						newAssigned[i] = s.assignedSlotPhotoIds[i];
					} else if (s.photos[i]) {
						newAssigned[i] = s.photos[i].id;
					}
				}
				const updated: SessionData = {
					...s,
					layoutId,
					assignedSlotPhotoIds: newAssigned
				};
				persistToSessionStorage(updated);
				return updated;
			});
		},
		addPhoto: (photo: PhotoItem) => {
			update((s) => {
				const existingIndex = s.photos.findIndex((p) => p.index === photo.index);
				let newPhotos: PhotoItem[];
				if (existingIndex >= 0) {
					newPhotos = [...s.photos];
					newPhotos[existingIndex] = photo;
				} else {
					newPhotos = [...s.photos, photo];
				}

				const layout = getLayoutById(s.layoutId);
				const count = layout.totalSlots || s.assignedSlotPhotoIds.length || 4;
				const newAssigned = [...s.assignedSlotPhotoIds];
				if (newAssigned.length !== count) {
					newAssigned.length = count;
				}
				if (s.mode === 'default' && photo.index < count) {
					newAssigned[photo.index] = photo.id;
				}
				const updated: SessionData = {
					...s,
					photos: newPhotos,
					assignedSlotPhotoIds: newAssigned
				};
				persistToSessionStorage(updated);
				return updated;
			});
		},
		retakeSlot: (slotIndex: number) => {
			update((s) => {
				const filteredPhotos = s.photos.filter((p) => p.index !== slotIndex);
				const newAssigned = [...s.assignedSlotPhotoIds];
				if (slotIndex < newAssigned.length) {
					newAssigned[slotIndex] = null;
				}
				const updated = {
					...s,
					photos: filteredPhotos,
					assignedSlotPhotoIds: newAssigned
				};
				persistToSessionStorage(updated);
				return updated;
			});
		},
		assignSlotPhoto: (slotIndex: number, photoId: string | null) => {
			update((s) => {
				const layout = getLayoutById(s.layoutId);
				const count = layout.totalSlots || 4;
				const newAssigned = new Array(count).fill(null);
				for (let i = 0; i < count; i++) {
					newAssigned[i] = s.assignedSlotPhotoIds[i] ?? null;
				}
				if (slotIndex < count) {
					newAssigned[slotIndex] = photoId;
				}
				const updated = { ...s, assignedSlotPhotoIds: newAssigned };
				persistToSessionStorage(updated);
				return updated;
			});
		},
		setPhotostrip: (dataUrl: string, blob: Blob) => {
			update((s) => {
				const updated = {
					...s,
					photostripDataUrl: dataUrl,
					photostripBlob: blob
				};
				persistToSessionStorage(updated);
				return updated;
			});
		},
		setVideostrip: (blob: Blob, url: string) => {
			update((s) => {
				const updated = {
					...s,
					videostripBlob: blob,
					videostripUrl: url
				};
				persistToSessionStorage(updated);
				return updated;
			});
		},
		finalizeAndSaveSession: () => {
			update((s) => {
				const updated = { ...s, isOfflineSaved: true };
				persistToSessionStorage(updated);
				// Save to permanent IndexedDB ONLY upon reaching result!
				saveSessionToDB(updated);
				return updated;
			});
		},
		incrementPrintCount: () => {
			update((s) => {
				const updated = { ...s, printCount: s.printCount + 1 };
				persistToSessionStorage(updated);
				saveSessionToDB(updated);
				return updated;
			});
		},
		setCloudUploadStatus: (
			status: 'idle' | 'uploading' | 'success' | 'failed',
			urls?: { photo?: string; video?: string; share?: string }
		) => {
			update((s) => {
				const updated: SessionData = {
					...s,
					cloudUploadStatus: status,
					cloudPhotoUrl: urls?.photo ?? s.cloudPhotoUrl,
					cloudVideoUrl: urls?.video ?? s.cloudVideoUrl,
					cloudShareUrl: urls?.share ?? s.cloudShareUrl
				};
				persistToSessionStorage(updated);
				if (s.isOfflineSaved) {
					saveSessionToDB(updated);
				}
				return updated;
			});
		},
		reset: () => {
			if (typeof window !== 'undefined') {
				sessionStorage.removeItem(SESSION_STORAGE_KEY);
			}
			set({ ...initialSession });
		}
	};
}

export const sessionStore = createSessionStore();
