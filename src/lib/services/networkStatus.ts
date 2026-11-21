import { writable, get } from 'svelte/store';
import { settingsStore } from '$lib/stores/settings';
import { getAllSessionsFromDB, saveSessionToDB } from '$lib/services/db';
import { uploadSessionToCloud } from '$lib/services/cloudStorage';
import type { CloudProvider } from '$lib/types';

const SAVED_CLOUD_PROVIDER_KEY = 'cheki_auto_saved_cloud_provider';

export interface NetworkState {
	isOnline: boolean;
	lastCheckedAt: number;
	autoSwitchedOffline: boolean;
	reconnectedNotification: boolean;
	isAutoSyncing: boolean;
	pendingSyncCount: number;
}

export const networkStore = writable<NetworkState>({
	isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
	lastCheckedAt: Date.now(),
	autoSwitchedOffline: false,
	reconnectedNotification: false,
	isAutoSyncing: false,
	pendingSyncCount: 0
});

let isInitialized = false;
let isAutoSyncRunning = false;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let notificationTimeout: ReturnType<typeof setTimeout> | null = null;
let initialSyncTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Automatically uploads offline-saved sessions in background when online & Cloudinary is configured.
 */
export async function syncPendingOfflineSessions(): Promise<void> {
	if (isAutoSyncRunning || typeof window === 'undefined') return;
	if (!get(networkStore).isOnline) return;

	const settings = get(settingsStore);
	if (
		settings.cloudProvider !== 'cloudinary' ||
		!settings.cloudinaryCloudName?.trim() ||
		!settings.cloudinaryUploadPreset?.trim()
	) {
		return;
	}

	isAutoSyncRunning = true;
	try {
		const allSessions = await getAllSessionsFromDB();
		const pending = allSessions.filter(
			(s) =>
				s.cloudUploadStatus !== 'success' &&
				!s.cloudPhotoUrl &&
				Boolean(s.photostripBlob || s.photostripDataUrl)
		);

		if (pending.length === 0) {
			networkStore.update((curr) => ({ ...curr, isAutoSyncing: false, pendingSyncCount: 0 }));
			return;
		}

		console.log(`[AutoSync] Found ${pending.length} pending offline session(s). Starting background upload...`);
		networkStore.update((curr) => ({
			...curr,
			isAutoSyncing: true,
			pendingSyncCount: pending.length
		}));

		let remaining = pending.length;
		for (const session of pending) {
			if (!get(networkStore).isOnline) {
				console.warn('[AutoSync] Connection lost mid-sync, pausing queue.');
				break;
			}

			try {
				const uploadRes = await uploadSessionToCloud(session, settings);
				if (uploadRes.photoUrl) {
					session.cloudPhotoUrl = uploadRes.photoUrl;
					session.cloudVideoUrl = uploadRes.videoUrl;
					session.cloudShareUrl = uploadRes.shareUrl;
					session.cloudUploadStatus = 'success';
					await saveSessionToDB(session);
					console.log(`[AutoSync] ✓ Synced offline session "${session.sessionId}"`);
				}
			} catch (err) {
				console.warn(`[AutoSync] Failed syncing session "${session.sessionId}":`, err);
			}

			remaining = Math.max(0, remaining - 1);
			networkStore.update((curr) => ({ ...curr, pendingSyncCount: remaining }));
		}
	} catch (err) {
		console.warn('[AutoSync] Queue processing error:', err);
	} finally {
		isAutoSyncRunning = false;
		networkStore.update((curr) => ({
			...curr,
			isAutoSyncing: false
		}));
	}
}

/**
 * Triggered when network drops (offline)
 */
function handleDisconnect(reason = 'offline-event') {
	const currentSettings = get(settingsStore);

	console.warn(`[Network] 🔴 Connection lost (${reason})!`);

	let didAutoSwitch = false;

	if (currentSettings.cloudProvider !== 'none') {
		try {
			localStorage.setItem(SAVED_CLOUD_PROVIDER_KEY, currentSettings.cloudProvider);
			settingsStore.updateSettings({ cloudProvider: 'none' });
			didAutoSwitch = true;
			console.log(`[Network] ⚡ Auto-switched cloudProvider from "${currentSettings.cloudProvider}" to "none" (Offline Mode)`);
		} catch (e) {
			console.warn('[Network] Failed to save cloud provider state:', e);
		}
	}

	networkStore.update((curr) => ({
		...curr,
		isOnline: false,
		lastCheckedAt: Date.now(),
		autoSwitchedOffline: didAutoSwitch || curr.autoSwitchedOffline,
		reconnectedNotification: false
	}));
}

/**
 * Triggered when network reconnects (online)
 */
function handleReconnect() {
	console.log('[Network] 🟢 Connection restored!');

	try {
		const saved = localStorage.getItem(SAVED_CLOUD_PROVIDER_KEY) as CloudProvider | null;
		if (saved && saved !== 'none') {
			settingsStore.updateSettings({ cloudProvider: saved });
			localStorage.removeItem(SAVED_CLOUD_PROVIDER_KEY);
			console.log(`[Network] ⚡ Auto-restored cloudProvider back to "${saved}"`);
		}
	} catch (e) {
		console.warn('[Network] Failed to restore cloud provider:', e);
	}

	if (notificationTimeout) clearTimeout(notificationTimeout);

	networkStore.update((curr) => ({
		...curr,
		isOnline: true,
		lastCheckedAt: Date.now(),
		autoSwitchedOffline: false,
		reconnectedNotification: true
	}));

	notificationTimeout = setTimeout(() => {
		networkStore.update((curr) => ({
			...curr,
			reconnectedNotification: false
		}));
	}, 4000);

	// Trigger background sync queue for any sessions captured while offline
	void syncPendingOfflineSessions();
}

/**
 * Periodic lightweight heartbeat ping to confirm actual internet connectivity
 */
async function checkInternetConnectivity() {
	if (typeof window === 'undefined') return;

	if (!navigator.onLine) {
		if (get(networkStore).isOnline) {
			handleDisconnect('navigator-offline');
		}
		return;
	}

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 2500);

		const res = await fetch(`/favicon.png?_ping=${Date.now()}`, {
			method: 'HEAD',
			cache: 'no-store',
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (res.ok) {
			if (!get(networkStore).isOnline) {
				handleReconnect();
			} else {
				networkStore.update((curr) => ({ ...curr, lastCheckedAt: Date.now() }));
			}
		} else {
			if (get(networkStore).isOnline) {
				handleDisconnect(`http-${res.status}`);
			}
		}
	} catch (err: any) {
		if (get(networkStore).isOnline) {
			handleDisconnect(err?.name === 'AbortError' ? 'timeout' : 'fetch-failed');
		}
	}
}

/**
 * Initializes the global network status monitor
 */
export function initNetworkMonitor() {
	if (typeof window === 'undefined' || isInitialized) return;
	isInitialized = true;

	window.addEventListener('online', () => {
		checkInternetConnectivity();
	});

	window.addEventListener('offline', () => {
		handleDisconnect('offline-event');
	});

	heartbeatInterval = setInterval(checkInternetConnectivity, 10000);

	if (!navigator.onLine) {
		handleDisconnect('initial-offline');
	} else {
		if (initialSyncTimeout) clearTimeout(initialSyncTimeout);
		initialSyncTimeout = setTimeout(() => {
			void syncPendingOfflineSessions();
		}, 5000);
	}
}
