import type { FrameLayout, PhotoItem, StickerItem } from '$lib/types';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface VideoCompilerOptions {
	layout: FrameLayout;
	photos: PhotoItem[];
	slotPhotoIds: (string | null)[];
	stickers?: StickerItem[];
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => resolve(img);
		img.src = src;
		setTimeout(() => resolve(img), 4000);
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

		let done = false;
		const finish = () => {
			if (!done) {
				done = true;
				resolve(video);
			}
		};

		video.oncanplaythrough = finish;
		video.onloadeddata = finish;
		video.onerror = finish;
		setTimeout(finish, 4000);
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
	drawRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, slot.borderRadius ?? 12);
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

// ─────────────────────────────────────────────────────────────────────────────
// Core composite frame renderer
// ─────────────────────────────────────────────────────────────────────────────

interface DrawFrameOpts {
	ctx: CanvasRenderingContext2D;
	origWidth: number;
	origHeight: number;
	scaleFactor: number;
	canvasWidth: number;
	canvasHeight: number;
	layout: FrameLayout;
	numSlots: number;
	preloadedImages: Map<number, HTMLImageElement>;
	preloadedVideos: Map<number, HTMLVideoElement>;
	activeSlot: number;
	overlayImg: HTMLImageElement | null;
	bgImg: HTMLImageElement | null;
	stickers: StickerItem[];
	isMirrored: boolean;
	brandingTitle: string;
	brandingSubtitle: string;
	guestName: string;
}

function drawCompositeFrame(opts: DrawFrameOpts) {
	const {
		ctx,
		origWidth,
		origHeight,
		scaleFactor,
		canvasWidth,
		canvasHeight,
		layout,
		numSlots,
		activeSlot,
		preloadedImages,
		preloadedVideos,
		overlayImg,
		bgImg,
		stickers,
		isMirrored,
		brandingTitle,
		brandingSubtitle,
		guestName
	} = opts;

	ctx.save();
	if (scaleFactor !== 1) {
		ctx.scale(canvasWidth / origWidth, canvasHeight / origHeight);
	}

	// Background
	ctx.fillStyle = layout.backgroundColor || '#FFFFFF';
	ctx.fillRect(0, 0, origWidth, origHeight);
	if (bgImg) ctx.drawImage(bgImg, 0, 0, origWidth, origHeight);

	// Slots
	for (let i = 0; i < numSlots; i++) {
		const slot = layout.slots[i];
		if (!slot) continue;

		if (i === activeSlot) {
			const video = preloadedVideos.get(i);
			if (video && video.readyState >= 2 && video.videoWidth > 0) {
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

	// Overlay
	if (overlayImg) ctx.drawImage(overlayImg, 0, 0, origWidth, origHeight);

	// Stickers
	for (const st of stickers) {
		ctx.save();
		ctx.translate((st.x / 100) * origWidth, (st.y / 100) * origHeight);
		if (st.rotation) ctx.rotate((st.rotation * Math.PI) / 180);
		ctx.font = `${st.size || 80}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(st.emoji, 0, 0);
		ctx.restore();
	}

	// Branding footer (custom frames only)
	if (!layout.id.startsWith('default-') && !overlayImg) {
		const isDarkBg = ['#18181b', '#000000'].includes((layout.backgroundColor || '').toLowerCase());
		const textColor = isDarkBg ? '#F4F4F5' : '#18181B';
		const subTextColor = isDarkBg ? '#A1A1AA' : '#71717A';
		const footerTop = layout.canvasHeight - (layout.footerHeight || 270);
		const cx = layout.canvasWidth / 2;

		ctx.save();
		ctx.fillStyle = textColor;
		ctx.font = '800 48px "Outfit", sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(brandingTitle.toUpperCase(), cx, footerTop + 90);

		ctx.fillStyle = subTextColor;
		ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
		const sub = guestName
			? `${guestName.toUpperCase()} • ${brandingSubtitle.toUpperCase()}`
			: brandingSubtitle.toUpperCase();
		ctx.fillText(sub, cx, footerTop + 140);
		ctx.restore();
	}

	ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export: Real-Time Playback Engine (ChekiYuu Architecture)
// ─────────────────────────────────────────────────────────────────────────────

export async function compileSequentialVideostrip(
	options: VideoCompilerOptions
): Promise<{ blob: Blob; url: string }> {
	const {
		layout,
		photos,
		slotPhotoIds,
		stickers = [],
		guestName = '',
		brandingTitle = 'CHEKIYUUME',
		brandingSubtitle = 'PHOTOBOOTH STUDIO',
		fps = 24,
		isMirrored = true,
		countdownSeconds,
		onProgress
	} = options;

	const numSlots = layout.slots.length;
	const photoMap = new Map<string, PhotoItem>();
	photos.forEach((p) => photoMap.set(p.id, p));

	// Preload images and videos
	const preloadedImages = new Map<number, HTMLImageElement>();
	const preloadedVideos = new Map<number, HTMLVideoElement>();
	const activeSlots: number[] = [];

	for (let i = 0; i < numSlots; i++) {
		const assignedId = slotPhotoIds[i] || (photos[i] ? photos[i].id : null);
		const photo = assignedId ? photoMap.get(assignedId) : null;

		if (photo?.dataUrl) {
			try {
				const img = await loadImage(photo.dataUrl);
				if (img.width > 0) preloadedImages.set(i, img);
			} catch (_) {}
		}

		if (photo?.btsVideoUrl) {
			try {
				const vid = await createVideoElement(photo.btsVideoUrl);
				preloadedVideos.set(i, vid);
				activeSlots.push(i);
			} catch (_) {
				if (preloadedImages.has(i)) activeSlots.push(i);
			}
		} else if (preloadedImages.has(i)) {
			activeSlots.push(i);
		}
	}

	if (activeSlots.length === 0) {
		for (let i = 0; i < numSlots; i++) activeSlots.push(i);
	}

	// Preload overlay / background
	let overlayImg: HTMLImageElement | null = null;
	if (layout.overlayUrl) {
		try {
			overlayImg = await loadImage(layout.overlayUrl);
		} catch (_) {}
	}
	let bgImg: HTMLImageElement | null = null;
	if (layout.backgroundUrl) {
		try {
			bgImg = await loadImage(layout.backgroundUrl);
		} catch (_) {}
	}

	// Timing calculation
	const segmentDuration =
		countdownSeconds && Number.isFinite(countdownSeconds) && countdownSeconds > 0
			? countdownSeconds
			: 3.0;

	let loopCount = 1;
	if (activeSlots.length === 1) loopCount = 3;
	else if (activeSlots.length === 2) loopCount = 2;

	const singlePassDuration = segmentDuration * activeSlots.length;
	const totalDuration = singlePassDuration * loopCount;

	// Dimensions: Guarantee even integers and bound max resolution for mobile GPU stability
	const origWidth = layout.canvasWidth || 1080;
	const origHeight = layout.canvasHeight || 3456;
	const evenOrigWidth = origWidth % 2 === 0 ? origWidth : origWidth - 1;
	const evenOrigHeight = origHeight % 2 === 0 ? origHeight : origHeight - 1;

	// Scale down for video encoding stability (1080p max height for mobile compatibility)
	const MAX_DIMENSION = 1080;
	let scaleFactor = 1;
	if (evenOrigWidth > MAX_DIMENSION || evenOrigHeight > MAX_DIMENSION) {
		scaleFactor = Math.min(MAX_DIMENSION / evenOrigWidth, MAX_DIMENSION / evenOrigHeight);
	}

	let canvasWidth = Math.round(evenOrigWidth * scaleFactor);
	let canvasHeight = Math.round(evenOrigHeight * scaleFactor);
	if (canvasWidth % 2 !== 0) canvasWidth--;
	if (canvasHeight % 2 !== 0) canvasHeight--;

	const canvas = document.createElement('canvas');
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext('2d', { alpha: false });
	if (!ctx) throw new Error('Canvas 2D context creation failed');

	const baseDrawOpts: Omit<DrawFrameOpts, 'activeSlot'> = {
		ctx,
		origWidth: evenOrigWidth,
		origHeight: evenOrigHeight,
		scaleFactor,
		canvasWidth,
		canvasHeight,
		layout,
		numSlots,
		preloadedImages,
		preloadedVideos,
		overlayImg,
		bgImg,
		stickers,
		isMirrored,
		brandingTitle,
		brandingSubtitle,
		guestName
	};

	// Start all videos upfront
	preloadedVideos.forEach((vid) => {
		vid.currentTime = 0;
		vid.play().catch(() => {});
	});
	await new Promise((r) => setTimeout(r, 100));

	// ─────────────────────────────────────────────────────────────────────────
	// WebCodecs Real-Time Render Pipeline
	// ─────────────────────────────────────────────────────────────────────────
	if (isWebCodecsSupported()) {
		try {
			const AVC_LEVELS = [
				{ codec: 'avc1.640033', label: '5.1 High' },
				{ codec: 'avc1.640028', label: '4.0 High' },
				{ codec: 'avc1.4d002a', label: '4.2 Main' },
				{ codec: 'avc1.42001f', label: '3.1 Baseline' }
			];

			let chosenCodec = AVC_LEVELS[1].codec; // default to 4.0 High
			for (const level of AVC_LEVELS) {
				try {
					const isSupported = await VideoEncoder.isConfigSupported({
						codec: level.codec,
						width: canvasWidth,
						height: canvasHeight,
						bitrate: 3_500_000,
						framerate: fps
					});
					if (isSupported.supported) {
						chosenCodec = level.codec;
						break;
					}
				} catch (_) {}
			}

			const target = new ArrayBufferTarget();
			const muxer = new Muxer({
				target,
				video: { codec: 'avc', width: canvasWidth, height: canvasHeight, frameRate: fps },
				fastStart: 'in-memory',
				firstTimestampBehavior: 'offset'
			});

			let encoderFailed = false;
			let encoderErrorMessage = '';
			const encoder = new VideoEncoder({
				output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
				error: (e) => {
					console.error('[VideoCompiler] VideoEncoder error:', e);
					encoderFailed = true;
					encoderErrorMessage = String(e);
				}
			});

			encoder.configure({
				codec: chosenCodec,
				width: canvasWidth,
				height: canvasHeight,
				bitrate: 3_500_000,
				framerate: fps
			});

			return await new Promise<{ blob: Blob; url: string }>((resolve, reject) => {
				const startTime = performance.now();
				let prevActiveIndex = -1;
				let frameCount = 0;
				const frameInterval = 1000 / fps;
				let lastFrameTime = 0;

				function drawFrame() {
					try {
						if (encoderFailed) {
							preloadedVideos.forEach((v) => v.pause());
							try {
								encoder.close();
							} catch (_) {}
							reject(new Error(`VideoEncoder failed: ${encoderErrorMessage}`));
							return;
						}

						const nowMs = performance.now() - startTime;
						const elapsed = nowMs / 1000;

						// Throttle to target FPS
						if (nowMs - lastFrameTime < frameInterval * 0.85) {
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

						// Reset video time when segment changes
						if (currentActiveIndex !== prevActiveIndex) {
							const vid = preloadedVideos.get(activeSlot);
							if (vid) {
								vid.currentTime = 0;
							}
							prevActiveIndex = currentActiveIndex;
						}

						// Draw the composite photostrip
						drawCompositeFrame({ ...baseDrawOpts, activeSlot });

						// Encode frame
						try {
							const timestampMicros = Math.round(elapsed * 1_000_000);
							const frame = new VideoFrame(canvas, { timestamp: timestampMicros });
							const isKeyFrame = frameCount % (fps * 2) === 0;
							encoder.encode(frame, { keyFrame: isKeyFrame });
							frame.close();
							frameCount++;
						} catch (e) {
							console.warn('[VideoCompiler] Frame encode warning:', e);
						}

						if (onProgress) {
							onProgress(Math.min(97, Math.round((elapsed / totalDuration) * 100)));
						}

						if (elapsed < totalDuration) {
							requestAnimationFrame(drawFrame);
						} else {
							finishEncoding();
						}
					} catch (loopErr) {
						preloadedVideos.forEach((v) => v.pause());
						reject(loopErr);
					}
				}

				function finishEncoding() {
					preloadedVideos.forEach((v) => v.pause());

					encoder
						.flush()
						.then(() => {
							encoder.close();
							muxer.finalize();

							if (onProgress) onProgress(100);
							const blob = new Blob([target.buffer], { type: 'video/mp4' });
							const url = URL.createObjectURL(blob);
							resolve({ blob, url });
						})
						.catch((err) => {
							reject(err);
						});
				}

				requestAnimationFrame(drawFrame);
			});
		} catch (webCodecsErr) {
			console.warn('[VideoCompiler] WebCodecs pipeline failed, switching to MediaRecorder fallback:', webCodecsErr);
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Fallback: Real-time MediaRecorder Stream (Universal Mobile/Safari fallback)
	// ─────────────────────────────────────────────────────────────────────────
	return new Promise((resolve, reject) => {
		const stream = canvas.captureStream(fps);
		const mimeType = MediaRecorder.isTypeSupported('video/mp4')
			? 'video/mp4'
			: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
				? 'video/webm;codecs=vp9'
				: 'video/webm';

		const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
		const chunks: Blob[] = [];

		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunks.push(e.data);
		};

		recorder.onstop = () => {
			preloadedVideos.forEach((v) => v.pause());
			if (chunks.length === 0) {
				reject(new Error('MediaRecorder: no chunks produced'));
				return;
			}
			const blob = new Blob(chunks, { type: mimeType });
			if (onProgress) onProgress(100);
			resolve({ blob, url: URL.createObjectURL(blob) });
		};

		recorder.onerror = (e) => {
			preloadedVideos.forEach((v) => v.pause());
			reject(e);
		};

		recorder.start();

		const startTime = performance.now();
		let prevActiveIndex = -1;

		function renderFallbackLoop() {
			const elapsed = (performance.now() - startTime) / 1000;
			const elapsedInPass = elapsed % singlePassDuration;
			const currentActiveIndex = Math.min(
				Math.floor(elapsedInPass / segmentDuration),
				activeSlots.length - 1
			);
			const activeSlot = activeSlots[currentActiveIndex];

			if (currentActiveIndex !== prevActiveIndex) {
				const vid = preloadedVideos.get(activeSlot);
				if (vid) vid.currentTime = 0;
				prevActiveIndex = currentActiveIndex;
			}

			drawCompositeFrame({ ...baseDrawOpts, activeSlot });

			if (onProgress) {
				onProgress(Math.min(97, Math.round((elapsed / totalDuration) * 100)));
			}

			if (elapsed < totalDuration) {
				requestAnimationFrame(renderFallbackLoop);
			} else {
				try {
					recorder.stop();
				} catch (_) {}
			}
		}

		requestAnimationFrame(renderFallbackLoop);
	});
}

