import type { FrameLayout, PhotoItem } from '$lib/types';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface VideoCompilerOptions {
	layout: FrameLayout;
	photos: PhotoItem[];
	slotPhotoIds: (string | null)[];
	guestName?: string;
	sessionId?: string;
	brandingTitle?: string;
	brandingSubtitle?: string;
	fps?: number;
	bitrate?: number;
	isMirrored?: boolean;
	countdownSeconds?: number;
	onProgress?: (progress: number) => void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => resolve(img); // Don't crash pipeline on image error
		img.src = src;
		setTimeout(() => resolve(img), 3000);
	});
}

function createVideoElement(url: string): Promise<HTMLVideoElement> {
	return new Promise((resolve) => {
		const video = document.createElement('video');
		video.crossOrigin = 'anonymous';
		video.src = url;
		video.muted = true;
		video.playsInline = true;
		video.preload = 'auto';
		video.loop = true;

		let isResolved = false;
		const done = () => {
			if (!isResolved) {
				isResolved = true;
				resolve(video);
			}
		};

		video.oncanplaythrough = done;
		video.onloadeddata = done;
		video.onerror = done;

		setTimeout(() => {
			done();
		}, 3000);

		video.load();
	});
}

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
) {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + width - radius, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
	ctx.lineTo(x + width, y + height - radius);
	ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
	ctx.lineTo(x + radius, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
	ctx.lineTo(x, y + radius);
	ctx.quadraticCurveTo(x, y, x + radius, y);
	ctx.closePath();
}

function drawToSlot(
	ctx: CanvasRenderingContext2D,
	source: HTMLImageElement | HTMLVideoElement,
	slot: { x: number; y: number; width: number; height: number; borderRadius?: number },
	mirror = false
) {
	const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
	const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

	if (!sourceWidth || !sourceHeight) return;

	const targetAspect = slot.width / slot.height;
	let cropWidth = sourceWidth;
	let cropHeight = cropWidth / targetAspect;

	if (cropHeight > sourceHeight) {
		cropHeight = sourceHeight;
		cropWidth = cropHeight * targetAspect;
	}

	const sx = (sourceWidth - cropWidth) / 2;
	const sy = (sourceHeight - cropHeight) / 2;

	ctx.save();
	const radius = slot.borderRadius ?? 12;
	drawRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, radius);
	ctx.clip();

	if (mirror) {
		ctx.translate(slot.x + slot.width, slot.y);
		ctx.scale(-1, 1);
		ctx.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, slot.width, slot.height);
	} else {
		ctx.drawImage(source, sx, sy, cropWidth, cropHeight, slot.x, slot.y, slot.width, slot.height);
	}
	ctx.restore();
}

function isWebCodecsSupported(): boolean {
	return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/**
 * Compiles a Sequential Videostrip into MP4 using live video playback and WebCodecs
 */
export async function compileSequentialVideostrip(
	options: VideoCompilerOptions
): Promise<{ blob: Blob; url: string }> {
	const {
		layout,
		photos,
		slotPhotoIds,
		guestName = '',
		sessionId = '',
		brandingTitle = 'CHEKIYUUME',
		brandingSubtitle = 'PHOTOBOOTH STUDIO',
		fps = 30,
		isMirrored = true,
		countdownSeconds,
		onProgress
	} = options;

	const numSlots = layout.slots.length;
	const photoMap = new Map<string, PhotoItem>();
	photos.forEach((p) => photoMap.set(p.id, p));

	// Preload all still images & video elements
	const preloadedImages = new Map<number, HTMLImageElement>();
	const preloadedVideos = new Map<number, HTMLVideoElement>();
	const activeSlots: number[] = [];

	for (let i = 0; i < numSlots; i++) {
		const assignedId = slotPhotoIds[i] || (photos[i] ? photos[i].id : null);
		const photo = assignedId ? photoMap.get(assignedId) : null;

		if (photo?.dataUrl) {
			try {
				const img = await loadImage(photo.dataUrl);
				preloadedImages.set(i, img);
			} catch (e) {}
		}

		if (photo?.btsVideoUrl) {
			try {
				const vid = await createVideoElement(photo.btsVideoUrl);
				preloadedVideos.set(i, vid);
				activeSlots.push(i);
			} catch (e) {}
		} else if (photo?.dataUrl) {
			activeSlots.push(i);
		}
	}

	if (activeSlots.length === 0) {
		for (let i = 0; i < numSlots; i++) activeSlots.push(i);
	}

	// Preload overlay & background images if present
	let overlayImg: HTMLImageElement | null = null;
	if (layout.overlayUrl) {
		try {
			overlayImg = await loadImage(layout.overlayUrl);
		} catch (e) {}
	}

	let bgImg: HTMLImageElement | null = null;
	if (layout.backgroundUrl) {
		try {
			bgImg = await loadImage(layout.backgroundUrl);
		} catch (e) {}
	}

	// Determine segment duration: match countdownSeconds (default: 5s)
	const segmentDuration = (countdownSeconds && Number.isFinite(countdownSeconds) && countdownSeconds > 0)
		? countdownSeconds
		: 5.0;

	// Set playbackRate safely (guard against WebM Infinity/NaN duration)
	preloadedVideos.forEach((vid) => {
		try {
			if (Number.isFinite(vid.duration) && vid.duration > 0 && segmentDuration > 0) {
				const rate = vid.duration / segmentDuration;
				if (Number.isFinite(rate) && rate > 0.1 && rate < 10) {
					vid.playbackRate = rate;
					return;
				}
			}
			vid.playbackRate = 1.0;
		} catch (e) {
			vid.playbackRate = 1.0;
		}
	});

	let loopCount = 1;
	if (activeSlots.length === 1) loopCount = 3;
	else if (activeSlots.length === 2) loopCount = 2;
	else loopCount = 1;

	const singlePassDuration = segmentDuration * activeSlots.length;
	const totalDuration = singlePassDuration * loopCount;

	const origWidth = layout.canvasWidth;
	const origHeight = layout.canvasHeight;
	const evenWidth = origWidth % 2 === 0 ? origWidth : origWidth - 1;
	const evenHeight = origHeight % 2 === 0 ? origHeight : origHeight - 1;

	const canvas = document.createElement('canvas');
	canvas.width = evenWidth;
	canvas.height = evenHeight;
	const ctx = canvas.getContext('2d', { alpha: false });

	if (!ctx) {
		throw new Error('Canvas 2D context creation failed');
	}

	if (isWebCodecsSupported()) {
		try {
			const AVC_LEVELS = [
				{ codec: 'avc1.640033', label: '5.1', maxPixels: 9_437_184 },
				{ codec: 'avc1.640032', label: '5.0', maxPixels: 5_652_480 },
				{ codec: 'avc1.640028', label: '4.0', maxPixels: 2_097_152 }
			];

			let chosenCodec = AVC_LEVELS[0].codec;
			let scaleFactor = 1;

			for (const level of AVC_LEVELS) {
				const totalPixels = evenWidth * evenHeight;
				if (totalPixels <= level.maxPixels) {
					try {
						const support = await VideoEncoder.isConfigSupported({
							codec: level.codec,
							width: evenWidth,
							height: evenHeight,
							bitrate: 6_000_000,
							framerate: fps
						});
						if (support.supported) {
							chosenCodec = level.codec;
							scaleFactor = 1;
							break;
						}
					} catch (_) {}
				}

				if (level === AVC_LEVELS[AVC_LEVELS.length - 1]) {
					const MAX_DIMENSION = 1080;
					if (evenWidth > MAX_DIMENSION || evenHeight > MAX_DIMENSION) {
						scaleFactor = Math.min(MAX_DIMENSION / evenWidth, MAX_DIMENSION / evenHeight);
					}
					chosenCodec = level.codec;
				}
			}

			let targetWidth = Math.round(evenWidth * scaleFactor);
			let targetHeight = Math.round(evenHeight * scaleFactor);
			const canvasWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
			const canvasHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

			canvas.width = canvasWidth;
			canvas.height = canvasHeight;

			const target = new ArrayBufferTarget();
			const muxer = new Muxer({
				target,
				video: {
					codec: 'avc',
					width: canvasWidth,
					height: canvasHeight,
					frameRate: fps
				},
				fastStart: 'in-memory',
				firstTimestampBehavior: 'offset'
			});

			let encoderFailed = false;
			const encoder = new VideoEncoder({
				output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
				error: (e) => {
					console.error('VideoEncoder error:', e);
					encoderFailed = true;
				}
			});

			encoder.configure({
				codec: chosenCodec,
				width: canvasWidth,
				height: canvasHeight,
				bitrate: 5_000_000,
				framerate: fps
			});

			// Start all videos upfront
			preloadedVideos.forEach((v) => {
				v.currentTime = 0;
				v.play().catch(() => {});
			});
			await new Promise((r) => setTimeout(r, 120));

			const blob = await new Promise<Blob>((resolve, reject) => {
				const startTime = performance.now();
				let prevActiveIndex = -1;
				let frameCount = 0;
				const frameInterval = 1000 / fps;
				let lastFrameTime = 0;

				function drawFrame() {
					try {
						if (encoderFailed) {
							preloadedVideos.forEach((v) => v.pause());
							try { encoder.close(); } catch (_) {}
							throw new Error('VideoEncoder failed');
						}

						const elapsed = (performance.now() - startTime) / 1000;
						const nowMs = performance.now() - startTime;

						if (nowMs - lastFrameTime < frameInterval * 0.8) {
							if (elapsed < totalDuration) {
								requestAnimationFrame(drawFrame);
							} else {
								finishEncoding();
							}
							return;
						}
						lastFrameTime = nowMs;

						const elapsedInPass = elapsed % singlePassDuration;
						const currentActiveIndex = Math.min(
							Math.floor(elapsedInPass / segmentDuration),
							activeSlots.length - 1
						);
						const activeSlot = activeSlots[currentActiveIndex];

						// Reset video when segment changes
						if (currentActiveIndex !== prevActiveIndex) {
							const vid = preloadedVideos.get(activeSlot);
							if (vid) {
								vid.currentTime = 0;
								vid.play().catch(() => {});
							}
							prevActiveIndex = currentActiveIndex;
						}

						ctx.save();
						if (scaleFactor !== 1) {
							ctx.scale(canvasWidth / origWidth, canvasHeight / origHeight);
						}

						// 1. Background
						ctx.fillStyle = layout.backgroundColor || '#FFFFFF';
						ctx.fillRect(0, 0, origWidth, origHeight);

						if (bgImg) {
							ctx.drawImage(bgImg, 0, 0, origWidth, origHeight);
						}

						// 2. Draw Each Slot
						for (let i = 0; i < numSlots; i++) {
							const slot = layout.slots[i];
							if (i === activeSlot) {
								const video = preloadedVideos.get(i);
								if (video && video.readyState >= 2) {
									drawToSlot(ctx, video, slot, isMirrored);
								} else {
									const photo = preloadedImages.get(i);
									if (photo) drawToSlot(ctx, photo, slot, false);
								}
							} else {
								const photo = preloadedImages.get(i);
								if (photo) drawToSlot(ctx, photo, slot, false);
							}
						}

						// 3. Draw Overlay Artwork
						if (overlayImg) {
							ctx.drawImage(overlayImg, 0, 0, origWidth, origHeight);
						}

						// 4. Draw Branding Footer (if no overlay)
						if (!overlayImg) {
							const isDarkBg = layout.backgroundColor.toLowerCase() === '#18181b' || layout.backgroundColor.toLowerCase() === '#000000';
							const textColor = isDarkBg ? '#F4F4F5' : '#18181B';
							const subTextColor = isDarkBg ? '#A1A1AA' : '#71717A';
							const footerTop = layout.canvasHeight - layout.footerHeight;
							const centerX = layout.canvasWidth / 2;

							ctx.save();
							ctx.fillStyle = textColor;
							ctx.font = '800 48px "Outfit", sans-serif';
							ctx.textAlign = 'center';
							ctx.letterSpacing = '4px';
							ctx.fillText(brandingTitle.toUpperCase(), centerX, footerTop + 90);

							ctx.fillStyle = subTextColor;
							ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
							ctx.letterSpacing = '2px';
							const displaySub = guestName ? `${guestName.toUpperCase()} • ${brandingSubtitle.toUpperCase()}` : brandingSubtitle.toUpperCase();
							ctx.fillText(displaySub, centerX, footerTop + 140);
							ctx.restore();
						}

						ctx.restore();

						// 5. Encode Frame
						try {
							const timestampMicros = Math.round(elapsed * 1_000_000);
							const frame = new VideoFrame(canvas, { timestamp: timestampMicros });
							const isKeyFrame = frameCount % (fps * 2) === 0;
							encoder.encode(frame, { keyFrame: isKeyFrame });
							frame.close();
							frameCount++;
						} catch (e) {
							console.warn('Frame encode error:', e);
						}

						if (onProgress) {
							onProgress(Math.min(98, Math.round((elapsed / totalDuration) * 100)));
						}

						if (elapsed < totalDuration) {
							requestAnimationFrame(drawFrame);
						} else {
							finishEncoding();
						}

						function finishEncoding() {
							preloadedVideos.forEach((v) => v.pause());
							encoder.flush().then(() => {
								encoder.close();
								muxer.finalize();
								const mp4Blob = new Blob([target.buffer], { type: 'video/mp4' });
								resolve(mp4Blob);
							}).catch(reject);
						}
					} catch (err) {
						preloadedVideos.forEach((v) => v.pause());
						try { encoder.close(); } catch (_) {}
						reject(err);
					}
				}

				requestAnimationFrame(drawFrame);
			});

			const url = URL.createObjectURL(blob);
			return { blob, url };
		} catch (err) {
			console.warn('[VideoCompiler] WebCodecs live compile failed, falling back to MediaRecorder', err);
		}
	}

	// Fallback to MediaRecorder WebM
	return new Promise((resolve) => {
		const stream = canvas.captureStream(fps);
		const chunks: Blob[] = [];
		const recorder = new MediaRecorder(stream, {
			mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
				? 'video/webm;codecs=vp9'
				: 'video/webm'
		});

		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunks.push(e.data);
		};

		recorder.onstop = () => {
			const blob = new Blob(chunks, { type: 'video/webm' });
			const url = URL.createObjectURL(blob);
			resolve({ blob, url });
		};

		preloadedVideos.forEach((v) => {
			v.currentTime = 0;
			v.play().catch(() => {});
		});

		recorder.start();
		let startTime = performance.now();
		let prevActiveIndex = -1;

		function drawFallbackFrame() {
			const elapsed = (performance.now() - startTime) / 1000;
			const elapsedInPass = elapsed % singlePassDuration;
			const currentActiveIndex = Math.min(
				Math.floor(elapsedInPass / segmentDuration),
				activeSlots.length - 1
			);
			const activeSlot = activeSlots[currentActiveIndex];

			if (currentActiveIndex !== prevActiveIndex) {
				const vid = preloadedVideos.get(activeSlot);
				if (vid) {
					vid.currentTime = 0;
					vid.play().catch(() => {});
				}
				prevActiveIndex = currentActiveIndex;
			}

			ctx.fillStyle = layout.backgroundColor || '#FFFFFF';
			ctx.fillRect(0, 0, origWidth, origHeight);

			for (let i = 0; i < numSlots; i++) {
				const slot = layout.slots[i];
				if (i === activeSlot) {
					const video = preloadedVideos.get(i);
					if (video && video.readyState >= 2) {
						drawToSlot(ctx, video, slot, isMirrored);
					} else {
						const photo = preloadedImages.get(i);
						if (photo) drawToSlot(ctx, photo, slot, false);
					}
				} else {
					const photo = preloadedImages.get(i);
					if (photo) drawToSlot(ctx, photo, slot, false);
				}
			}

			if (overlayImg) {
				ctx.drawImage(overlayImg, 0, 0, origWidth, origHeight);
			}

			if (elapsed < totalDuration) {
				requestAnimationFrame(drawFallbackFrame);
			} else {
				preloadedVideos.forEach((v) => v.pause());
				setTimeout(() => recorder.stop(), 100);
			}
		}

		requestAnimationFrame(drawFallbackFrame);
	});
}
