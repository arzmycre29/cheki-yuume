export interface VideoDeviceInfo {
	deviceId: string;
	label: string;
}

export class CameraService {
	private stream: MediaStream | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private recordedChunks: Blob[] = [];

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

			return videoDevices.map((d, i) => ({
				deviceId: d.deviceId,
				label: d.label || `Kamera ${i + 1} (${d.deviceId.slice(0, 5)})`
			}));
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

		const resMap = {
			'720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
			'1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
			'4k': { width: { ideal: 3840 }, height: { ideal: 2160 } }
		};

		const videoConstraints: MediaTrackConstraints = {
			...resMap[resolution],
			frameRate: { ideal: 30, max: 60 }
		};

		if (deviceId) {
			videoConstraints.deviceId = { exact: deviceId };
		}

		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				video: videoConstraints,
				audio: false
			});
			return this.stream;
		} catch (err) {
			console.warn('[Camera] Exact constraints failed, falling back to basic camera request', err);
			this.stream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: false
			});
			return this.stream;
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
