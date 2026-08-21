import { Capacitor } from '@capacitor/core';
import { UsbCamera, type UsbCameraResult } from '@periksa/cap-usb-camera';

export interface UvcCaptureResult {
	success: boolean;
	dataUrl: string | null;
	blob: Blob | null;
	statusCode: number;
	statusCodeDesc: string;
	exitCode: string;
	message: string;
	diagnosticInfo: string;
}

/**
 * Helper to convert Base64 DataURL to Blob
 */
export function dataUrlToBlob(dataUrl: string): Blob {
	const arr = dataUrl.split(',');
	const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
	const bstr = atob(arr[1]);
	let n = bstr.length;
	const u8arr = new Uint8Array(n);
	while (n--) {
		u8arr[n] = bstr.charCodeAt(n);
	}
	return new Blob([u8arr], { type: mime });
}

/**
 * Returns human-readable Indonesian diagnostic message based on exit_code from UsbCamera plugin
 */
export function getUvcExitCodeDescription(exitCode: string, statusCode: number): string {
	switch (exitCode) {
		case 'success':
			return 'Kamera USB berhasil menangkap foto.';
		case 'exit_no_device':
			return 'Kamera USB (UVC) TIDAK terdeteksi oleh Android. Pastikan kabel OTG terhubung kencang dan webcam mendukung format UVC.';
		case 'user_canceled':
			return 'Akses USB dibatalkan atau pengguna menutup jendela kamera sebelum memotret.';
		case 'device_disconnected':
			return 'Kabel USB kamera terlepas / terputus di tengah proses.';
		default:
			if (statusCode === -1) {
				return 'Pengambilan foto selesai (OK).';
			} else if (statusCode === 0) {
				return `Dibatalkan (${exitCode || 'exit_canceled'}).`;
			}
			return `Status: ${exitCode || 'Unknown'} (Code: ${statusCode})`;
	}
}

class UvcCameraService {
	/**
	 * Checks if currently running natively on Android with Capacitor
	 */
	isAvailable(): boolean {
		return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
	}

	/**
	 * Retrieves the last fatal crash stack trace from Android native layer if any occurred
	 */
	getLatestNativeCrash(): string | null {
		if (typeof window !== 'undefined' && (window as any).NativeCrashReporter) {
			try {
				const crash = (window as any).NativeCrashReporter.getLastCrash();
				return crash && crash.trim().length > 0 ? crash : null;
			} catch (e) {
				return null;
			}
		}
		return null;
	}

	clearNativeCrash() {
		if (typeof window !== 'undefined' && (window as any).NativeCrashReporter) {
			try {
				(window as any).NativeCrashReporter.clearLastCrash();
			} catch (e) {}
		}
	}

	/**
	 * Captures a single high-resolution photo from the external USB UVC camera
	 */
	async capturePhoto(saveToStorage = false): Promise<UvcCaptureResult> {
		if (!this.isAvailable()) {
			return {
				success: false,
				dataUrl: null,
				blob: null,
				statusCode: -99,
				statusCodeDesc: 'NOT_SUPPORTED',
				exitCode: 'browser_environment',
				message: 'Kamera UVC native hanya aktif pada aplikasi Android (APK) dengan USB OTG.',
				diagnosticInfo: 'Jalankan di perangkat Android fisik dengan kabel OTG dan USB Camera terpasang.'
			};
		}

		try {
			const res: any = await UsbCamera.getPhoto({ saveToStorage });
			const exitCode = res.exit_code || (res.status_code === -1 ? 'success' : 'canceled');
			const errorStack = res.error_stack || '';
			const nativeCrash = this.getLatestNativeCrash();

			let diagnosticInfo = getUvcExitCodeDescription(exitCode, res.status_code);
			if (errorStack) {
				diagnosticInfo += `\n\n[Java Stack Trace]:\n${errorStack}`;
			} else if (nativeCrash) {
				diagnosticInfo += `\n\n[Native Crash Detected]:\n${nativeCrash}`;
			}

			if (res.status_code === -1 && res.data?.dataURL) {
				const blob = dataUrlToBlob(res.data.dataURL);
				return {
					success: true,
					dataUrl: res.data.dataURL,
					blob,
					statusCode: res.status_code,
					statusCodeDesc: res.status_code_s || 'OK',
					exitCode,
					message: 'Foto UVC berhasil diambil!',
					diagnosticInfo
				};
			}

			return {
				success: false,
				dataUrl: null,
				blob: null,
				statusCode: res.status_code,
				statusCodeDesc: res.status_code_s || 'CANCELED',
				exitCode,
				message: `Gagal menangkap foto UVC: ${exitCode}`,
				diagnosticInfo
			};
		} catch (err: any) {
			console.error('[UvcCameraService] Capture failed:', err);
			const nativeCrash = this.getLatestNativeCrash();
			const diagnosticInfo = nativeCrash
				? `Native Crash Log:\n${nativeCrash}`
				: `Error detail: ${err?.message || err}\n${err?.stack || ''}`;

			return {
				success: false,
				dataUrl: null,
				blob: null,
				statusCode: -1,
				statusCodeDesc: 'ERROR',
				exitCode: 'plugin_exception',
				message: err?.message || 'Terjadi kesalahan pada plugin USB Camera.',
				diagnosticInfo
			};
		}
	}
}

export const uvcCameraService = new UvcCameraService();

