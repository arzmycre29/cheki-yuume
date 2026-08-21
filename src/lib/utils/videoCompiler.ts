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
		// Do NOT set loop=true — we will seek manually

		let done = false;
		const finish = () => {
			if (!done) { done = true; resolve(video); }
		};
		video.oncanplaythrough = finish;
		video.onloadeddata = finish;
		video.onerror = finish;
		setTimeout(finish, 4000);
		video.load();
	});
}

/**
 * Seek a video element to a precise timestamp and wait for the frame to decode.
 */
function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
	return new Promise((resolve) => {
		const clampedTime = Math.max(0, isFinite(video.duration) && video.duration > 0
			? Math.min(time, video.duration - 0.001)
			: time);

		// Already close enough (within one frame at 30fps)
		if (Math.abs(video.currentTime - clampedTime) < 0.034) {
			resolve();
			return;
		}

		let settled = false;
		const finish = () => {
			if (!settled) { settled = true; resolve(); }
		};
		video.addEventListener('seeked', finish, { once: true });
		setTimeout(finish, 300); // safety fallback
		video.currentTime = clampedTime;
	});
}

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number, y: number, width: number, height: number, radius: number
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
	elapsed: number;
	origWidth: number;
	origHeight: number;
	scaleFactor: number;
	canvasWidth: number;
	canvasHeight: number;
	layout: FrameLayout;
	numSlots: number;
	activeSlots: number[];
	segmentDuration: number;
	singlePassDuration: number;
	preloadedImages: Map<number, HTMLImageElement>;
	preloadedVideos: Map<number, HTMLVideoElement>;
	activeSlotIndex: number; // current slot being animated (already resolved)
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
		ctx, elapsed, origWidth, origHeight, scaleFactor, canvasWidth, canvasHeight,
		layout, numSlots, activeSlot,
		preloadedImages, preloadedVideos,
		overlayImg, bgImg, stickers, isMirrored,
		brandingTitle, brandingSubtitle, guestName
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
		if (i === activeSlot) {
			const video = preloadedVideos.get(i);
			// Use video if loaded, otherwise fallback to still image
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
		const isDarkBg = ['#18181b', '#000000'].includes(layout.backgroundColor.toLowerCase());
		const textColor = isDarkBg ? '#F4F4F5' : '#18181B';
		const subTextColor = isDarkBg ? '#A1A1AA' : '#71717A';
		const footerTop = layout.canvasHeight - layout.footerHeight;
		const cx = layout.canvasWidth / 2;

		ctx.save();
		ctx.fillStyle = textColor;
		ctx.font = '800 48px "Outfit", sans-serif';
		ctx.textAlign = 'center';
		ctx.letterSpacing = '4px';
		ctx.fillText(brandingTitle.toUpperCase(), cx, footerTop + 90);

		ctx.fillStyle = subTextColor;
		ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
		ctx.letterSpacing = '2px';
		const sub = guestName
			? `${guestName.toUpperCase()} • ${brandingSubtitle.toUpperCase()}`
			: brandingSubtitle.toUpperCase();
		ctx.fillText(sub, cx, footerTop + 140);
		ctx.restore();
	}

	ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
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
		sessionId = '',
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
		try { overlayImg = await loadImage(layout.overlayUrl); } catch (_) {}
	}
	let bgImg: HTMLImageElement | null = null;
	if (layout.backgroundUrl) {
		try { bgImg = await loadImage(layout.backgroundUrl); } catch (_) {}
	}

	// Timing
	const segmentDuration = (countdownSeconds && Number.isFinite(countdownSeconds) && countdownSeconds > 0)
		? countdownSeconds
		: 3.0;

	// Compute playback rates for BTS videos
	preloadedVideos.forEach((vid) => {
		if (Number.isFinite(vid.duration) && vid.duration > 0 && segmentDuration > 0) {
			const rate = vid.duration / segmentDuration;
			if (Number.isFinite(rate) && rate > 0.1 && rate < 16) {
				vid.playbackRate = rate;
			} else {
				vid.playbackRate = 1.0;
			}
		} else {
			vid.playbackRate = 1.0;
		}
	});

	let loopCount = 1;
	if (activeSlots.length === 1) loopCount = 3;
	else if (activeSlots.length === 2) loopCount = 2;

	const singlePassDuration = segmentDuration * activeSlots.length;
	const totalDuration = singlePassDuration * loopCount;
	const frameIntervalMs = 1000 / fps;
	const totalFrames = Math.ceil(totalDuration * fps);

	// Canvas dimensions (cap at 1280px, ensure even integers)
	const origWidth = layout.canvasWidth;
	const origHeight = layout.canvasHeight;
	let evenWidth = origWidth % 2 === 0 ? origWidth : origWidth - 1;
	let evenHeight = origHeight % 2 === 0 ? origHeight : origHeight - 1;
	const MAX_DIMENSION = 1280;
	let scaleFactor = 1;
	if (evenWidth > MAX_DIMENSION || evenHeight > MAX_DIMENSION) {
		scaleFactor = Math.min(MAX_DIMENSION / evenWidth, MAX_DIMENSION / evenHeight);
	}
	let canvasWidth = Math.round(evenWidth * scaleFactor);
	let canvasHeight = Math.round(evenHeight * scaleFactor);
	if (canvasWidth % 2 !== 0) canvasWidth--;
	if (canvasHeight % 2 !== 0) canvasHeight--;

	const canvas = document.createElement('canvas');
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext('2d', { alpha: false });
	if (!ctx) throw new Error('Canvas 2D context creation failed');

	const baseDrawOpts = {
		ctx, origWidth, origHeight, scaleFactor, canvasWidth, canvasHeight,
		layout, numSlots, activeSlots, segmentDuration, singlePassDuration,
		preloadedImages, preloadedVideos,
		overlayImg, bgImg, stickers, isMirrored,
		brandingTitle, brandingSubtitle, guestName
	};

	/**
	 * Determine which slot is active and seek its BTS video to the correct position.
	 * Returns { activeSlotIndex, activeSlot }.
	 */
	async function prepareFrame(elapsed: number): Promise<{ activeSlotIndex: number; activeSlot: number }> {
		const elapsedInPass = elapsed % singlePassDuration;
		const activeSlotIndex = Math.min(
			Math.floor(elapsedInPass / segmentDuration),
			activeSlots.length - 1
		);
		const activeSlot = activeSlots[activeSlotIndex];

		const vid = preloadedVideos.get(activeSlot);
		if (vid) {
			// Compute exact position within this segment in the video's own time
			const elapsedInSegment = elapsedInPass - activeSlotIndex * segmentDuration;
			const targetTime = elapsedInSegment * (vid.playbackRate || 1);
			await seekVideoTo(vid, targetTime);
		}

		return { activeSlotIndex, activeSlot };
	}

	// ─────────────────────────────────────────────────────────────────────────
	// WebCodecs path
	// ─────────────────────────────────────────────────────────────────────────
	if (isWebCodecsSupported()) {
		try {
			const AVC_LEVELS = [
				'avc1.640028', // High 4.0
				'avc1.4d0028', // Main 4.0
				'avc1.42001f', // Baseline 3.1
			];
			let chosenCodec = AVC_LEVELS[0];
			for (const codec of AVC_LEVELS) {
				try {
					const support = await VideoEncoder.isConfigSupported({
						codec, width: canvasWidth, height: canvasHeight,
						bitrate: 4_000_000, framerate: fps
					});
					if (support.supported) { chosenCodec = codec; break; }
				} catch (_) {}
			}

			const target = new ArrayBufferTarget();
			const muxer = new Muxer({
				target,
				video: { codec: 'avc', width: canvasWidth, height: canvasHeight, frameRate: fps },
				fastStart: 'in-memory',
				firstTimestampBehavior: 'offset'
			});

			let encoderError: Error | null = null;
			const encoder = new VideoEncoder({
				output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
				error: (e) => { encoderError = e; }
			});

			encoder.configure({
				codec: chosenCodec,
				width: canvasWidth,
				height: canvasHeight,
				bitrate: 4_000_000,
				framerate: fps
			});

			// Encode all frames sequentially, seeking BTS video to the correct position each frame
			for (let f = 0; f < totalFrames; f++) {
				if (encoderError) throw encoderError;

				const elapsedMs = f * frameIntervalMs;
				const elapsed = elapsedMs / 1000;

				const { activeSlotIndex, activeSlot } = await prepareFrame(elapsed);

				drawCompositeFrame({ ...baseDrawOpts, elapsed, activeSlotIndex, activeSlot });

				try {
					const timestampMicros = Math.round(elapsedMs * 1000);
					const frame = new VideoFrame(canvas, { timestamp: timestampMicros });
					encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
					frame.close();
				} catch (e) {
					console.warn('[VideoCompiler] Frame encode error:', e);
				}

				if (onProgress) {
					onProgress(Math.min(97, Math.round(((f + 1) / totalFrames) * 100)));
				}

				// Yield to browser every 8 frames to prevent UI lockup and allow Android WebView to breathe
				if (f % 8 === 0) {
					await new Promise((r) => setTimeout(r, 0));
				}
			}

			await encoder.flush();
			encoder.close();
			muxer.finalize();

			if (onProgress) onProgress(100);

			const blob = new Blob([target.buffer], { type: 'video/mp4' });
			const url = URL.createObjectURL(blob);
			return { blob, url };
		} catch (err) {
			console.warn('[VideoCompiler] WebCodecs path failed, falling back to MediaRecorder:', err);
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Fallback: MediaRecorder with explicit frame capture via requestFrame()
	// ─────────────────────────────────────────────────────────────────────────
	return new Promise((resolve, reject) => {
		// captureStream(0) = we control exactly when frames are captured
		const stream = canvas.captureStream(0);
		const videoTrack = stream.getVideoTracks()[0];

		const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
			? 'video/webm;codecs=vp9'
			: 'video/webm';
		const recorder = new MediaRecorder(stream, { mimeType });
		const chunks: Blob[] = [];

		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunks.push(e.data);
		};
		recorder.onstop = () => {
			if (chunks.length === 0) { reject(new Error('MediaRecorder: no chunks')); return; }
			const blob = new Blob(chunks, { type: 'video/webm' });
			resolve({ blob, url: URL.createObjectURL(blob) });
		};
		recorder.onerror = (e) => reject(e);
		recorder.start();

		(async () => {
			try {
				for (let f = 0; f < totalFrames; f++) {
					const elapsedMs = f * frameIntervalMs;
					const elapsed = elapsedMs / 1000;

					const { activeSlotIndex, activeSlot } = await prepareFrame(elapsed);
					drawCompositeFrame({ ...baseDrawOpts, elapsed, activeSlotIndex, activeSlot });

					// Explicitly capture this canvas frame into the MediaRecorder stream
					if (videoTrack && typeof (videoTrack as MediaStreamTrack & { requestFrame?: () => void }).requestFrame === 'function') {
						(videoTrack as MediaStreamTrack & { requestFrame: () => void }).requestFrame();
					}

					if (onProgress) {
						onProgress(Math.min(97, Math.round(((f + 1) / totalFrames) * 100)));
					}

					// Yield every 8 frames
					if (f % 8 === 0) {
						await new Promise((r) => setTimeout(r, 0));
					}
				}

				if (onProgress) onProgress(100);
				await new Promise((r) => setTimeout(r, 200));
				try { recorder.stop(); } catch (_) {}
			} catch (err) {
				reject(err);
			}
		})();
	});
}
