import type { FrameLayout } from '$lib/types';

export const FRAMES_CACHE_NAME = 'cheki-frames-cache-v1';

export interface OfflineCacheResult {
	success: boolean;
	total: number;
	cached: number;
	newlyCached: number;
	failed: number;
}

/**
 * Extracts unique remote HTTP(S) image URLs (overlayUrl & backgroundUrl) from frames.
 */
export function extractFrameAssetUrls(frames: FrameLayout[]): string[] {
	const urls = new Set<string>();
	for (const frame of frames) {
		if (frame?.overlayUrl && /^https?:\/\//i.test(frame.overlayUrl.trim())) {
			urls.add(frame.overlayUrl.trim());
		}
		if (frame?.backgroundUrl && /^https?:\/\//i.test(frame.backgroundUrl.trim())) {
			urls.add(frame.backgroundUrl.trim());
		}
	}
	return Array.from(urls);
}

/**
 * Pre-caches all remote custom frame PNG overlays into Cache Storage with CORS mode
 * so Canvas rendering (`crossOrigin = 'anonymous'`) works 100% offline without tainting.
 */
export async function precacheFrameAssets(
	frames: FrameLayout[],
	onProgress?: (cached: number, total: number) => void
): Promise<OfflineCacheResult> {
	const urls = extractFrameAssetUrls(frames);
	const total = urls.length;

	if (typeof window === 'undefined' || !('caches' in window)) {
		return { success: false, total, cached: 0, newlyCached: 0, failed: total };
	}

	if (total === 0) {
		if (onProgress) onProgress(0, 0);
		return { success: true, total: 0, cached: 0, newlyCached: 0, failed: 0 };
	}

	const cache = await caches.open(FRAMES_CACHE_NAME);
	let cached = 0;
	let newlyCached = 0;
	let failed = 0;

	const batchSize = 4;
	for (let i = 0; i < urls.length; i += batchSize) {
		const chunk = urls.slice(i, i + batchSize);
		await Promise.all(
			chunk.map(async (url) => {
				try {
					const existing = await cache.match(url);
					if (existing && existing.ok) {
						cached++;
						return;
					}

					const res = await fetch(url, {
						mode: 'cors',
						credentials: 'omit',
						cache: 'force-cache'
					});
					if (res.ok && res.type !== 'opaque') {
						await cache.put(url, res.clone());
						cached++;
						newlyCached++;
					} else {
						failed++;
					}
				} catch (err) {
					console.warn('[OfflineCache] Failed to cache frame asset:', url, err);
					failed++;
				}
			})
		);

		if (onProgress) {
			onProgress(cached, total);
		}
	}

	return {
		success: failed === 0,
		total,
		cached,
		newlyCached,
		failed
	};
}

/**
 * Prepares the kiosk for offline operation: ensures Service Worker is registered
 * and pre-caches all custom frame overlay PNGs into persistent Cache Storage.
 */
export async function prepareFullOfflineCache(
	frames: FrameLayout[],
	onProgress?: (cached: number, total: number) => void
): Promise<OfflineCacheResult> {
	if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
		try {
			await navigator.serviceWorker.register('/service-worker.js');
		} catch (_) {}
	}

	return await precacheFrameAssets(frames, onProgress);
}
