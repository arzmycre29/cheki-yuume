import { registerPlugin } from '@capacitor/core';

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

export const Camera2 = registerPlugin<Camera2PluginInterface>('Camera2');

export class Camera2Service {
	static async isSupported(): Promise<boolean> {
		try {
			const res = await Camera2.getCameras();
			return Array.isArray(res?.cameras);
		} catch (e) {
			console.warn('[Camera2Service] Camera2 plugin not available or not on native Android:', e);
			return false;
		}
	}

	static async getAvailableCameras(): Promise<Camera2Device[]> {
		try {
			const res = await Camera2.getCameras();
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
		return await Camera2.capturePhoto({
			cameraId,
			width,
			height
		});
	}
}
