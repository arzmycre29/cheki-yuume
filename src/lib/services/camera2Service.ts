export interface Camera2Device {
	id: string;
	name: string;
	facing: 'front' | 'back' | 'external' | 'unknown';
	isExternal: boolean;
	maxResolution: string;
}

export interface Camera2PluginInterface {
	getCameras(): Promise<{ cameras: Camera2Device[]; total: number }>;
	capturePhoto(options: {
		cameraId: string;
		width?: number;
		height?: number;
	}): Promise<{ success: boolean; dataUrl: string }>;
}

function getCamera2Plugin(): Camera2PluginInterface | null {
	if (typeof window !== 'undefined') {
		const cap = (window as any).Capacitor;
		if (cap?.Plugins?.Camera2) {
			return cap.Plugins.Camera2 as Camera2PluginInterface;
		}
	}
	return null;
}

export class Camera2Service {
	static async isSupported(): Promise<boolean> {
		const plugin = getCamera2Plugin();
		if (!plugin) return false;
		try {
			const res = await plugin.getCameras();
			return Array.isArray(res?.cameras);
		} catch (e) {
			console.warn('[Camera2Service] Camera2 plugin not available or error:', e);
			return false;
		}
	}

	static async getAvailableCameras(): Promise<Camera2Device[]> {
		const plugin = getCamera2Plugin();
		if (!plugin) return [];
		try {
			const res = await plugin.getCameras();
			return res?.cameras || [];
		} catch (e) {
			console.error('[Camera2Service] Failed to get Camera2 devices:', e);
			return [];
		}
	}

	static async captureHighResPhoto(
		cameraId: string,
		width = 1920,
		height = 1080
	): Promise<{ success: boolean; dataUrl: string }> {
		const plugin = getCamera2Plugin();
		if (!plugin) {
			return { success: false, dataUrl: '' };
		}
		return await plugin.capturePhoto({
			cameraId,
			width,
			height
		});
	}
}
