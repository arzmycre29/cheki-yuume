import { writable, get } from 'svelte/store';
import { settingsStore } from '$lib/stores/settings';
import type { CloudProvider } from '$lib/types';

const SAVED_CLOUD_PROVIDER_KEY = 'cheki_auto_saved_cloud_provider';

export interface NetworkState {
	isOnline: boolean;
	lastCheckedAt: number;
	autoSwitchedOffline: boolean;
	reconnectedNotification: boolean;
}

export const networkStore = writable<NetworkState>({
	isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
	lastCheckedAt: Date.now(),
	autoSwitchedOffline: false,
	reconnectedNotification: false
});

let isInitialized = false;
let heartbeatInterval: any = null;
let notificationTimeout: any = null;

/**
 * Triggered when network drops (offline)
 */
function handleDisconnect(reason = 'offline-event') {
	const currentSettings = get(settingsStore);

	console.warn(`[Network] 🔴 Connection lost (${reason})!`);

	let didAutoSwitch = false;

	// If cloud was active, save it and switch to local offline mode
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

	// If it was auto-switched to offline, restore previous cloud provider
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

	networkStore.update(() => ({
		isOnline: true,
		lastCheckedAt: Date.now(),
		autoSwitchedOffline: false,
		reconnectedNotification: true
	}));

	// Hide reconnected toast after 4 seconds
	notificationTimeout = setTimeout(() => {
		networkStore.update((curr) => ({
			...curr,
			reconnectedNotification: false
		}));
	}, 4000);
}

/**
 * Periodic lightweight heartbeat ping to confirm actual internet connectivity
 */
async function checkInternetConnectivity() {
	if (typeof window === 'undefined') return;

	// If OS already reports offline, trigger disconnect immediately
	if (!navigator.onLine) {
		if (get(networkStore).isOnline) {
			handleDisconnect('navigator-offline');
		}
		return;
	}

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 2500);

		// Ping lightweight endpoint with cache-busting
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
		// Network request aborted or failed -> offline
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

	// 1. Listen to browser online/offline events
	window.addEventListener('online', () => {
		checkInternetConnectivity();
	});

	window.addEventListener('offline', () => {
		handleDisconnect('offline-event');
	});

	// 2. Start heartbeat (every 10 seconds)
	heartbeatInterval = setInterval(checkInternetConnectivity, 10000);

	// 3. Initial check
	if (!navigator.onLine) {
		handleDisconnect('initial-offline');
	}
}
