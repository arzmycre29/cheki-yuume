import { writable } from 'svelte/store';
import type { KioskSettings } from '$lib/types';

const STORAGE_KEY = 'chekiyuume_kiosk_settings';

const envPin =
	(typeof import.meta !== 'undefined' &&
		(import.meta.env?.PUBLIC_ADMIN_PIN || import.meta.env?.VITE_ADMIN_PIN)) ||
	'';

const defaultSettings: KioskSettings = {
	cameraSource: 'internal',
	cameraDeviceId: '',
	cameraResolution: '720p',
	isMirrored: true,
	countdownSeconds: 5,
	btsDurationSeconds: 3,
	autoResetSeconds: 60,
	adminPin: envPin || '0509',
	kioskTitle: 'CHEKIYUUME',
	kioskSubtitle: 'PHOTOBOOTH STUDIO',
	cloudProvider: 'cloudinary',
	cloudinaryCloudName:
		(typeof import.meta !== 'undefined' &&
			(import.meta.env?.PUBLIC_CLOUDINARY_CLOUD_NAME || import.meta.env?.VITE_CLOUDINARY_CLOUD_NAME)) ||
		'qhdvucyw',
	cloudinaryUploadPreset:
		(typeof import.meta !== 'undefined' &&
			(import.meta.env?.PUBLIC_CLOUDINARY_UPLOAD_PRESET || import.meta.env?.VITE_CLOUDINARY_UPLOAD_PRESET)) ||
		'',
	cloudPublicBaseUrl:
		(typeof import.meta !== 'undefined' &&
			(import.meta.env?.PUBLIC_SHARE_BASE_URL || import.meta.env?.VITE_SHARE_BASE_URL)) ||
		'https://cheki-yuume.pages.dev',
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
			const parsed = JSON.parse(raw);
			if (parsed.adminPin === '1234' || !parsed.adminPin) {
				parsed.adminPin = defaultSettings.adminPin;
			}
			if (!parsed.cloudinaryCloudName) {
				parsed.cloudinaryCloudName = defaultSettings.cloudinaryCloudName;
			}
			if (!parsed.cloudPublicBaseUrl) {
				parsed.cloudPublicBaseUrl = defaultSettings.cloudPublicBaseUrl;
			}
			return { ...defaultSettings, ...parsed };
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
