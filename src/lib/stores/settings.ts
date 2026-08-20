import { writable } from 'svelte/store';
import type { KioskSettings } from '$lib/types';

const STORAGE_KEY = 'chekiyuume_kiosk_settings';

const defaultSettings: KioskSettings = {
	cameraDeviceId: '',
	cameraResolution: '1080p',
	isMirrored: true,
	countdownSeconds: 5,
	btsDurationSeconds: 3,
	autoResetSeconds: 60,
	adminPin: '1234',
	kioskTitle: 'CHEKIYUUME',
	kioskSubtitle: 'PHOTOBOOTH STUDIO',
	cloudProvider: 'cloudinary',
	cloudinaryCloudName: '',
	cloudinaryUploadPreset: '',
	cloudPublicBaseUrl: '',
	cloudEndpoint: '',
	cloudBucket: '',
	cloudAccessKey: '',
	cloudSecretKey: '',
	defaultPaperSize: '4R',
	defaultCopies: 2,
	enableSound: true
};

function loadInitialSettings(): KioskSettings {
	if (typeof window === 'undefined') return defaultSettings;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			return { ...defaultSettings, ...JSON.parse(raw) };
		}
	} catch (e) {
		console.warn('[Settings] Failed to load settings from storage', e);
	}
	return defaultSettings;
}

function createSettingsStore() {
	const { subscribe, set, update } = writable<KioskSettings>(loadInitialSettings());

	return {
		subscribe,
		updateSettings: (partial: Partial<KioskSettings>) => {
			update((curr) => {
				const next = { ...curr, ...partial };
				if (typeof window !== 'undefined') {
					localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
				}
				return next;
			});
		},
		resetToDefault: () => {
			if (typeof window !== 'undefined') {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSettings));
			}
			set(defaultSettings);
		}
	};
}

export const settingsStore = createSettingsStore();
