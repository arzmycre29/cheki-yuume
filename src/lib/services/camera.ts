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
			const devices = await navigator.mediaDevices.enumerateDevices();
			const videoDevices = devices.filter((d) => d.kind === 'videoinput');
			return videoDevices.map((d, i) => ({
				deviceId: d.deviceId,
				label: d.label || `Kamera ${i + 1}`
			}));
		} catch (err) {
			console.error('[Camera] Failed to list devices:', err);
			return [];
		}
	}

	async startStream(
		deviceId?: string,
		resolution: '1080p' | '4k' | '720p' = '1080p'
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

		canvas.width = Math.round(cropW);
		canvas.height = Math.round(cropH);
		const ctx = canvas.getContext('2d');

		if (!ctx) {
			throw new Error('Could not create 2D canvas context');
		}

		if (isMirrored) {
			ctx.translate(canvas.width, 0);
			ctx.scale(-1, 1);
		}

		ctx.drawImage(videoElement, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);

		const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
		const blobPromise = new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(b) => {
					if (b) resolve(b);
					else reject(new Error('Failed to create photo blob'));
				},
				'image/jpeg',
				0.96
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
			let mimeType = 'video/webm;codecs=vp9';
			if (!MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = 'video/webm;codecs=vp8';
				if (!MediaRecorder.isTypeSupported(mimeType)) {
					mimeType = 'video/webm';
				}
			}

			this.mediaRecorder = new MediaRecorder(this.stream, {
				mimeType,
				videoBitsPerSecond: 4000000
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

		return new Promise<{ blob: Blob; url: string }>((resolve) => {
			this.mediaRecorder!.onstop = () => {
				const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
				const url = URL.createObjectURL(blob);
				resolve({ blob, url });
			};
			this.mediaRecorder!.stop();
		});
	}
}

export const cameraService = new CameraService();
