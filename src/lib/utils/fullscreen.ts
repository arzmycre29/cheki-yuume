/**
 * Cross-browser Fullscreen Utility for Mobile & Desktop Web
 */

export function isFullscreen(): boolean {
	if (typeof document === 'undefined') return false;
	const doc = document as any;
	return !!(
		doc.fullscreenElement ||
		doc.webkitFullscreenElement ||
		doc.mozFullScreenElement ||
		doc.msFullscreenElement
	);
}

export async function enterFullscreen(element?: HTMLElement): Promise<boolean> {
	if (typeof document === 'undefined') return false;
	const target = element || document.documentElement;
	const el = target as any;

	try {
		if (el.requestFullscreen) {
			await el.requestFullscreen();
			return true;
		} else if (el.webkitRequestFullscreen) {
			await el.webkitRequestFullscreen();
			return true;
		} else if (el.mozRequestFullScreen) {
			await el.mozRequestFullScreen();
			return true;
		} else if (el.msRequestFullscreen) {
			await el.msRequestFullscreen();
			return true;
		}
	} catch (err) {
		console.warn('[Fullscreen] Request failed or blocked by browser policy:', err);
	}
	return false;
}

export async function exitFullscreen(): Promise<boolean> {
	if (typeof document === 'undefined') return false;
	const doc = document as any;

	try {
		if (doc.exitFullscreen) {
			await doc.exitFullscreen();
			return true;
		} else if (doc.webkitExitFullscreen) {
			await doc.webkitExitFullscreen();
			return true;
		} else if (doc.mozCancelFullScreen) {
			await doc.mozCancelFullScreen();
			return true;
		} else if (doc.msExitFullscreen) {
			await doc.msExitFullscreen();
			return true;
		}
	} catch (err) {
		console.warn('[Fullscreen] Exit failed:', err);
	}
	return false;
}

export async function toggleFullscreen(element?: HTMLElement): Promise<boolean> {
	if (isFullscreen()) {
		await exitFullscreen();
		return false;
	} else {
		return await enterFullscreen(element);
	}
}

export function onFullscreenChange(callback: (active: boolean) => void): () => void {
	if (typeof document === 'undefined') return () => {};

	const handler = () => {
		callback(isFullscreen());
	};

	document.addEventListener('fullscreenchange', handler);
	document.addEventListener('webkitfullscreenchange', handler);
	document.addEventListener('mozfullscreenchange', handler);
	document.addEventListener('MSFullscreenChange', handler);

	return () => {
		document.removeEventListener('fullscreenchange', handler);
		document.removeEventListener('webkitfullscreenchange', handler);
		document.removeEventListener('mozfullscreenchange', handler);
		document.removeEventListener('MSFullscreenChange', handler);
	};
}
