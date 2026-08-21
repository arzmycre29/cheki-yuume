export interface VideoDeviceInfo {
	deviceId: string;
	label: string;
	isUsb?: boolean;
}

export interface CameraDiagnosticReport {
	isSecureContext: boolean;
	protocol: string;
	hostname: string;
	hasMediaDevices: boolean;
	hasGetUserMedia: boolean;
	permissionState: string;
	deviceCount: number;
	devices: Array<{ deviceId: string; label: string; kind: string }>;
	errorCode?: string;
	errorMessage?: string;
	errorName?: string;
	errorStack?: string;
	suggestedFix: string;
	userAgent: string;
	timestamp: string;
}

export class CameraService {
	private stream: MediaStream | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private recordedChunks: Blob[] = [];

	async runDiagnostics(
		deviceId?: string,
		resolution: '1080p' | '4k' | '720p' = '720p'
	): Promise<CameraDiagnosticReport> {
		const isSec = typeof window !== 'undefined' ? window.isSecureContext : false;
		const protocol = typeof location !== 'undefined' ? location.protocol : '';
		const hostname = typeof location !== 'undefined' ? location.hostname : '';
		const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
		const hasGetUserMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
		const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

		let permissionState = 'unknown';
		if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
			try {
				const status = await navigator.permissions.query({ name: 'camera' as any });
				permissionState = status.state;
			} catch (_) {}
		}

		let devices: Array<{ deviceId: string; label: string; kind: string }> = [];
		if (hasMediaDevices && navigator.mediaDevices.enumerateDevices) {
			try {
				const devList = await navigator.mediaDevices.enumerateDevices();
				devices = devList
					.filter((d) => d.kind === 'videoinput')
					.map((d) => ({
						deviceId: d.deviceId,
						label: d.label || 'Unnamed Device',
						kind: d.kind
					}));
			} catch (_) {}
		}

		const report: CameraDiagnosticReport = {
			isSecureContext: isSec,
			protocol,
			hostname,
			hasMediaDevices,
			hasGetUserMedia,
			permissionState,
			deviceCount: devices.length,
			devices,
			userAgent,
			timestamp: new Date().toISOString(),
			suggestedFix: 'Kamera beroperasi dengan normal.'
		};

		// 1. Insecure HTTP Context
		if (!isSec && hostname !== 'localhost' && hostname !== '127.0.0.1') {
			report.errorCode = 'ERR_INSECURE_HTTP_CONTEXT';
			report.errorName = 'InsecureContextError';
			report.errorMessage = `Akses WebRTC kamera diblokir browser pada alamat non-HTTPS (${hostname}).`;
			report.suggestedFix =
				'Buka aplikasi menggunakan domain resmi HTTPS (seperti https://cheki-yuume.pages.dev) atau jalankan langsung di localhost laptop tersebut.';
			return report;
		}

		// 2. Permission Denied
		if (permissionState === 'denied') {
			report.errorCode = 'ERR_PERMISSION_DENIED';
			report.errorName = 'NotAllowedError';
			report.errorMessage = 'Izin kamera diblokir di setelan browser laptop ini.';
			report.suggestedFix =
				'Klik ikon gembok / kamera di bilah URL browser (sebelah kiri domain), ubah setelan Kamera menjadi "Izinkan / Allow", lalu refresh halaman.';
			return report;
		}

		// 3. No Camera Hardware
		if (devices.length === 0 && permissionState !== 'prompt') {
			report.errorCode = 'ERR_NO_CAMERA_HARDWARE';
			report.errorName = 'NotFoundError';
			report.errorMessage = 'Tidak ada perangkat webcam atau kamera video yang terdeteksi oleh sistem operasi.';
			report.suggestedFix =
				'Pastikan webcam terhubung dengan benar dan driver kamera aktif di Device Manager Windows/OS.';
			return report;
		}

		// 4. Test actual stream connection
		try {
			const stream = await this.startStream(deviceId, resolution);
			stream.getTracks().forEach((t) => t.stop());
		} catch (err: any) {
			report.errorCode = err?.name || 'ERR_GETUSERMEDIA_FAILED';
			report.errorName = err?.name || 'CameraStreamError';
			report.errorMessage = err?.message || String(err);
			report.errorStack = err?.stack || '';

			if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
				report.suggestedFix =
					'Klik popup browser dan pilih "Izinkan Kamera", atau ubah setelan izin di ikon gembok bilah URL.';
			} else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
				report.suggestedFix =
					'Kamera sedang dikunci/digunakan oleh aplikasi lain (Zoom, OBS, Teams, Discord, atau aplikasi Kamera Windows). Tutup aplikasi tersebut lalu coba lagi.';
			} else if (err?.name === 'OverconstrainedError') {
				report.suggestedFix =
					'Webcam laptop ini tidak mendukung resolusi atau frame rate yang diminta. Sistem akan otomatis beralih ke resolusi dasar.';
			} else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
				report.suggestedFix =
					'Webcam terputus atau tidak terdeteksi oleh driver sistem operasi.';
			} else {
				report.suggestedFix =
					'Muat ulang halaman browser atau periksa pengaturan privasi kamera di Windows Settings > Privacy & Security > Camera.';
			}
		}

		return report;
	}

	async getAvailableCameras(): Promise<VideoDeviceInfo[]> {
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
			return [];
		}
		try {
			let devices = await navigator.mediaDevices.enumerateDevices();
			let videoDevices = devices.filter((d) => d.kind === 'videoinput');

			// If labels are empty, prompt getUserMedia once to unlock full device labels & external USB devices
			if (videoDevices.length === 0 || videoDevices.every((d) => !d.label)) {
				try {
					const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
					devices = await navigator.mediaDevices.enumerateDevices();
					videoDevices = devices.filter((d) => d.kind === 'videoinput');
					tempStream.getTracks().forEach((t) => t.stop());
				} catch (permErr) {
					console.warn('[Camera] Permission request to unlock devices:', permErr);
				}
			}

			return videoDevices.map((d, i) => {
				const lowerLabel = (d.label || '').toLowerCase();
				const isUsb =
					lowerLabel.includes('usb') ||
					lowerLabel.includes('uvc') ||
					lowerLabel.includes('webcam') ||
					lowerLabel.includes('external') ||
					lowerLabel.includes('capture') ||
					lowerLabel.includes('cam');

				let friendlyName = d.label;
				if (!friendlyName) {
					friendlyName = `Kamera ${i + 1} (${d.deviceId.slice(0, 5)})`;
				} else if (isUsb && !friendlyName.toLowerCase().startsWith('usb')) {
					friendlyName = `📹 USB / External: ${friendlyName}`;
				}

				return {
					deviceId: d.deviceId,
					label: friendlyName,
					isUsb
				};
			});
		} catch (err) {
			console.error('[Camera] Failed to list devices:', err);
			return [];
		}
	}

	async startStream(
		deviceId?: string,
		resolution: '1080p' | '4k' | '720p' = '720p'
	): Promise<MediaStream> {
		this.stopStream();

		const targetDeviceId = deviceId && deviceId.trim() !== '' ? deviceId.trim() : undefined;

		const resMap = {
			'720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
			'1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
			'4k': { width: { ideal: 3840 }, height: { ideal: 2160 } }
		};

		const resConfig = resMap[resolution] || resMap['720p'];

		const videoConstraints: MediaTrackConstraints = {
			...resConfig
		};

		if (targetDeviceId) {
			videoConstraints.deviceId = { ideal: targetDeviceId };
		}

		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				video: videoConstraints,
				audio: false
			});
			return this.stream;
		} catch (err) {
			console.warn('[Camera] Targeted constraints failed, falling back to basic camera request:', err);
			try {
				this.stream = await navigator.mediaDevices.getUserMedia({
					video: true,
					audio: false
				});
				return this.stream;
			} catch (fatalErr) {
				console.error('[Camera] All getUserMedia attempts failed:', fatalErr);
				throw fatalErr;
			}
		}
	}

	stopStream() {
		if (this.stream) {
			this.stream.getTracks().forEach((track) => track.stop());
			this.stream = null;
		}
	}

	getStream(): MediaStream | null {
		return this.stream;
	}

	/**
	 * Takes a high-resolution 4:3 snapshot from the video element matching the viewfinder
	 */
	capturePhoto(
		videoElement: HTMLVideoElement,
		isMirrored = false
	): { dataUrl: string; blob: Promise<Blob> } {
		const canvas = document.createElement('canvas');
		const vW = videoElement.videoWidth || 1920;
		const vH = videoElement.videoHeight || 1080;
		const targetAspect = 4 / 3; // Exact 4:3 photostrip slot ratio

		let cropW = vW;
		let cropH = cropW / targetAspect;
		if (cropH > vH) {
			cropH = vH;
			cropW = cropH * targetAspect;
		}

		const sx = (vW - cropW) / 2;
		const sy = (vH - cropH) / 2;

		// Maximum clean 1440x1080 or 1920x1440 canvas
		canvas.width = Math.min(Math.round(cropW), 1440);
		canvas.height = Math.round(canvas.width / targetAspect);
		const ctx = canvas.getContext('2d', { alpha: false });

		if (!ctx) {
			throw new Error('Could not create 2D canvas context');
		}

		if (isMirrored) {
			ctx.translate(canvas.width, 0);
			ctx.scale(-1, 1);
		}

		ctx.drawImage(videoElement, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);

		const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
		const blobPromise = new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(b) => {
					if (b) resolve(b);
					else reject(new Error('Failed to create photo blob'));
				},
				'image/jpeg',
				0.92
			);
		});

		return { dataUrl, blob: blobPromise };
	}

	/**
	 * Starts recording BTS video clip from the active stream during countdown
	 */
	startBtsRecording(): void {
		if (!this.stream) return;
		this.recordedChunks = [];

		try {
			let mimeType = 'video/webm;codecs=vp8';
			if (!MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = 'video/webm';
			}

			this.mediaRecorder = new MediaRecorder(this.stream, {
				mimeType,
				videoBitsPerSecond: 1500000 // Optimized 1.5 Mbps for smooth real-time performance
			});

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data && event.data.size > 0) {
					this.recordedChunks.push(event.data);
				}
			};

			this.mediaRecorder.start(100);
		} catch (err) {
			console.error('[Camera] Failed to start MediaRecorder:', err);
		}
	}

	/**
	 * Stops recording BTS video clip and returns the video blob & blob URL
	 */
	async stopBtsRecording(): Promise<{ blob: Blob; url: string } | null> {
		if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
			return null;
		}

		return new Promise<{ blob: Blob; url: string } | null>((resolve) => {
			let isResolved = false;
			const finish = () => {
				if (!isResolved) {
					isResolved = true;
					if (this.recordedChunks && this.recordedChunks.length > 0) {
						const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
						const url = URL.createObjectURL(blob);
						resolve({ blob, url });
					} else {
						resolve(null);
					}
				}
			};

			this.mediaRecorder!.onstop = finish;
			try {
				this.mediaRecorder!.stop();
			} catch (_) {
				finish();
			}

			// Safety timeout: never hang more than 1500ms
			setTimeout(finish, 1500);
		});
	}
}

export const cameraService = new CameraService();
