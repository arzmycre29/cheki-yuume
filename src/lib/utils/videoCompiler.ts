import type { FrameLayout, PhotoItem, StickerItem } from '$lib/types';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import QRCode from 'qrcode';

export interface VideoCompilerOptions {
	layout: FrameLayout;
	photos: PhotoItem[];
	slotPhotoIds: (string | null)[];
	stickers?: StickerItem[];
	guestName?: string;
	sessionId?: string;
	brandingTitle?: string;
	brandingSubtitle?: string;
	shareUrl?: string;
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
	qrImg: HTMLImageElement | null;
	stickers: StickerItem[];
	isMirrored: boolean;
	brandingTitle: string;
	brandingSubtitle: string;
	guestName: string;
	sessionId: string;
	dateStr: string;
	timeStr: string;
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
		qrImg,
		stickers,
		isMirrored,
		brandingTitle,
		brandingSubtitle,
		guestName,
		sessionId,
		dateStr,
		timeStr
	} = opts;

	ctx.save();
	if (scaleFactor !== 1) {
		ctx.scale(canvasWidth / origWidth, canvasHeight / origHeight);
	}

	const isThematicReceipt = layout.id.startsWith('thematic-receipt');

	// 1. Background
	ctx.fillStyle = layout.backgroundColor || '#FFFFFF';
	ctx.fillRect(0, 0, origWidth, origHeight);
	if (bgImg) ctx.drawImage(bgImg, 0, 0, origWidth, origHeight);

	// 2. Receipt Header (for Thematic Receipt)
	if (isThematicReceipt) {
		ctx.save();
		ctx.fillStyle = '#111111';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';

		// Store Header
		ctx.font = '900 42px "Outfit", sans-serif';
		ctx.letterSpacing = '3px';
		ctx.fillText(`*** ${(brandingTitle || 'CHEKIYUUME').toUpperCase()} ***`, origWidth / 2, 45);

		ctx.font = '700 22px "Plus Jakarta Sans", monospace';
		ctx.letterSpacing = '2px';
		ctx.fillStyle = '#444444';
		ctx.fillText(`${(brandingSubtitle || 'PHOTOBOOTH STUDIO').toUpperCase()}`, origWidth / 2, 100);

		// Dashed Divider
		ctx.setLineDash([8, 6]);
		ctx.strokeStyle = '#555555';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(54, 145);
		ctx.lineTo(origWidth - 54, 145);
		ctx.stroke();

		// Info Rows (monospaced receipt style)
		ctx.setLineDash([]);
		ctx.textAlign = 'left';
		ctx.font = '600 24px "Plus Jakarta Sans", monospace';
		ctx.fillStyle = '#222222';
		ctx.fillText(`ORDER : #${(sessionId ? sessionId.slice(-8) : '002819').toUpperCase()}`, 74, 175);
		ctx.fillText(`DATE  : ${dateStr} ${timeStr}`, 74, 218);
		ctx.fillText(`GUEST : ${(guestName ? guestName.toUpperCase() : 'SPECIAL GUEST').slice(0, 20)}`, 74, 260);

		ctx.textAlign = 'right';
		ctx.font = '600 22px "Plus Jakarta Sans", monospace';
		ctx.fillStyle = '#555555';
		ctx.fillText(`POS #01`, origWidth - 74, 175);
		ctx.fillText(`REG: MEMORY`, origWidth - 74, 218);
		ctx.fillText(`3 POSES`, origWidth - 74, 260);

		// Dashed Divider before photos
		ctx.setLineDash([8, 6]);
		ctx.strokeStyle = '#555555';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(54, 310);
		ctx.lineTo(origWidth - 54, 310);
		ctx.stroke();
		ctx.restore();
	}

	// 3. Slots (Videos / Photos)
	for (let i = 0; i < numSlots; i++) {
		const slot = layout.slots[i];
		if (!slot) continue;

		if (i === activeSlot) {
			const video = preloadedVideos.get(i);
			if (video && video.videoWidth > 0) {
				drawToSlot(ctx, video, slot, isMirrored);
			} else {
				const photo = preloadedImages.get(i);
				if (photo) drawToSlot(ctx, photo, slot, false);
			}
		} else {
			const photo = preloadedImages.get(i);
			if (photo) drawToSlot(ctx, photo, slot, false);
		}

		// Optional border outline for receipt photo slots
		if (isThematicReceipt) {
			ctx.save();
			ctx.strokeStyle = '#444444';
			ctx.lineWidth = 2.5;
			drawRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, slot.borderRadius ?? 4);
			ctx.stroke();
			ctx.restore();
		}
	}

	// 4. Overlay Artwork
	if (overlayImg) ctx.drawImage(overlayImg, 0, 0, origWidth, origHeight);

	// 5. Stickers
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

	// 6. Footer Rendering
	if (isThematicReceipt) {
		const footerTop = layout.canvasHeight - layout.footerHeight;
		const centerX = origWidth / 2;

		ctx.save();
		ctx.textBaseline = 'top';

		// Top dashed line of footer
		ctx.setLineDash([8, 6]);
		ctx.strokeStyle = '#555555';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(54, footerTop + 20);
		ctx.lineTo(origWidth - 54, footerTop + 20);
		ctx.stroke();

		// Receipt Itemized summary
		ctx.setLineDash([]);
		ctx.textAlign = 'left';
		ctx.font = '600 24px "Plus Jakarta Sans", monospace';
		ctx.fillStyle = '#222222';
		ctx.fillText(`3X PHOTOBOOTH SNAPSHOTS`, 74, footerTop + 65);
		ctx.textAlign = 'right';
		ctx.fillText(`PRICELESS`, origWidth - 74, footerTop + 65);

		ctx.textAlign = 'left';
		ctx.font = '500 22px "Plus Jakarta Sans", monospace';
		ctx.fillStyle = '#666666';
		ctx.fillText(`DIGITAL COPY & BTS VIDEO`, 74, footerTop + 105);
		ctx.textAlign = 'right';
		ctx.fillText(`INCLUDED`, origWidth - 74, footerTop + 105);

		// Double separator
		ctx.strokeStyle = '#222222';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(54, footerTop + 145);
		ctx.lineTo(origWidth - 54, footerTop + 145);
		ctx.stroke();

		// Total Line
		ctx.textAlign = 'left';
		ctx.font = '800 28px "Plus Jakarta Sans", monospace';
		ctx.fillStyle = '#111111';
		ctx.fillText(`TOTAL HAPPINESS`, 74, footerTop + 195);
		ctx.textAlign = 'right';
		ctx.fillText(`100% SUCCESS`, origWidth - 74, footerTop + 195);

		// Dashed Divider below Total
		ctx.setLineDash([8, 6]);
		ctx.strokeStyle = '#555555';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(54, footerTop + 235);
		ctx.lineTo(origWidth - 54, footerTop + 235);
		ctx.stroke();
		ctx.setLineDash([]);

		if (qrImg) {
			// Subtitle above QR
			ctx.textAlign = 'center';
			ctx.font = '700 20px "Plus Jakarta Sans", monospace';
			ctx.letterSpacing = '1px';
			ctx.fillStyle = '#222222';
			ctx.fillText('SCAN TO DOWNLOAD PHOTO & VIDEO', centerX, footerTop + 265);

			// Draw QR Code centered
			const qrSize = 260;
			const qrX = centerX - qrSize / 2;
			const qrY = footerTop + 295;
			ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

			// Order / Session ID snippet below QR
			ctx.font = '700 20px "Plus Jakarta Sans", monospace';
			ctx.letterSpacing = '0px';
			ctx.fillStyle = '#333333';
			const codeStr = sessionId ? `* ${sessionId.toUpperCase().slice(-14)} *` : '* CHEKIYUUME-RECEIPT *';
			ctx.fillText(codeStr, centerX, footerTop + 575);
		} else {
			// Fallback text if QR image is not available
			ctx.textAlign = 'center';
			ctx.font = '700 20px "Plus Jakarta Sans", monospace';
			ctx.letterSpacing = '0px';
			ctx.fillStyle = '#333333';
			const codeStr = sessionId ? `* ${sessionId.toUpperCase().slice(-14)} *` : '* CHEKIYUUME-RECEIPT *';
			ctx.fillText(codeStr, centerX, footerTop + 375);
		}

		// Thank You Note
		ctx.textAlign = 'center';
		ctx.font = '800 24px "Outfit", sans-serif';
		ctx.letterSpacing = '2px';
		ctx.fillStyle = '#111111';
		ctx.fillText(`*** THANK YOU FOR VISITING ***`, centerX, footerTop + 620);

		// Social handle
		ctx.font = '600 18px "Plus Jakarta Sans", monospace';
		ctx.letterSpacing = '1px';
		ctx.fillStyle = '#666666';
		ctx.fillText(`SHARE YOUR MOMENTS • TAG US @CHEKIYUUME`, centerX, footerTop + 660);

		ctx.restore();
	} else if (!layout.id.startsWith('default-') && !overlayImg) {
		const isDarkBg = ['#18181b', '#000000'].includes((layout.backgroundColor || '').toLowerCase());
		const textColor = isDarkBg ? '#F4F4F5' : '#18181B';
		const subTextColor = isDarkBg ? '#A1A1AA' : '#71717A';
		const footerTop = layout.canvasHeight - (layout.footerHeight || 270);
		const cx = origWidth / 2;

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

	// Preload QR Code (for Thematic Receipt)
	let qrImg: HTMLImageElement | null = null;
	const isThematicReceipt = layout.id.startsWith('thematic-receipt');
	if (isThematicReceipt) {
		const targetShareUrl = options.shareUrl || (
			sessionId
				? (typeof window !== 'undefined' ? `${window.location.origin}/share/${sessionId}` : `/share/${sessionId}`)
				: ''
		);
		if (targetShareUrl) {
			try {
				const qrDataUrl = await QRCode.toDataURL(targetShareUrl, {
					width: 320,
					margin: 1,
					color: { dark: '#000000', light: '#ffffff' },
					errorCorrectionLevel: 'M'
				});
				if (qrDataUrl) {
					qrImg = await loadImage(qrDataUrl);
				}
			} catch (e) {
				console.warn('[VideoCompiler] Failed to generate QR code for video:', e);
			}
		}
	}

	// Pre-format receipt date & time
	const now = new Date();
	const dateStr = now.toLocaleDateString('id-ID', {
		day: '2-digit',
		month: 'short',
		year: 'numeric'
	}).toUpperCase();
	const timeStr = now.toLocaleTimeString('id-ID', {
		hour: '2-digit',
		minute: '2-digit'
	});

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

	// Optimal target width: 720px (HD) for vertical photostrips, or up to 1080px (FHD) if height <= 1920
	let targetWidth = 720;
	if (evenOrigHeight <= 1920 && evenOrigWidth <= 1080) {
		targetWidth = Math.min(evenOrigWidth, 1080);
	}
	let scaleFactor = targetWidth / evenOrigWidth;

	// Safety cap: Ensure height does not exceed 2304px (H.264 Level 4.1 safe limit: 6480 macroblocks <= 8192)
	const MAX_SAFE_HEIGHT = 2304;
	if (Math.round(evenOrigHeight * scaleFactor) > MAX_SAFE_HEIGHT) {
		scaleFactor = MAX_SAFE_HEIGHT / evenOrigHeight;
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
		qrImg,
		stickers,
		isMirrored,
		brandingTitle,
		brandingSubtitle,
		guestName,
		sessionId: sessionId || '',
		dateStr,
		timeStr
	};

	// Attach hidden container to DOM so browser hardware decoder keeps video active
	let hiddenContainer: HTMLDivElement | null = null;
	if (typeof document !== 'undefined') {
		hiddenContainer = document.createElement('div');
		hiddenContainer.setAttribute('aria-hidden', 'true');
		hiddenContainer.style.cssText =
			'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-99999;overflow:hidden;';
		document.body.appendChild(hiddenContainer);
		preloadedVideos.forEach((vid) => {
			hiddenContainer!.appendChild(vid);
		});
	}

	function cleanup() {
		preloadedVideos.forEach((v) => {
			try {
				v.pause();
			} catch (_) {}
		});
		if (hiddenContainer && hiddenContainer.parentNode) {
			hiddenContainer.parentNode.removeChild(hiddenContainer);
			hiddenContainer = null;
		}
	}

	function activateSlotVideo(slotIdx: number) {
		preloadedVideos.forEach((vid, idx) => {
			if (idx !== slotIdx) {
				try {
					vid.pause();
				} catch (_) {}
			}
		});

		const currentVid = preloadedVideos.get(slotIdx);
		if (currentVid) {
			try {
				// Scale playback rate so video duration matches segment duration smoothly
				if (Number.isFinite(currentVid.duration) && currentVid.duration > 0 && segmentDuration > 0) {
					const targetRate = currentVid.duration / segmentDuration;
					currentVid.playbackRate = Math.min(Math.max(targetRate, 0.25), 4.0);
				} else {
					currentVid.playbackRate = 1.0;
				}
				currentVid.currentTime = 0;
				const playPromise = currentVid.play();
				if (playPromise !== undefined) {
					playPromise.catch((e) => console.warn('[VideoCompiler] Video play failed on slot', slotIdx, e));
				}
			} catch (_) {}
		}
	}

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

			const targetBitrate = options.bitrate || 6_000_000;
			let chosenCodec = AVC_LEVELS[1].codec; // default to 4.0 High
			for (const level of AVC_LEVELS) {
				try {
					const isSupported = await VideoEncoder.isConfigSupported({
						codec: level.codec,
						width: canvasWidth,
						height: canvasHeight,
						bitrate: targetBitrate,
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
				bitrate: targetBitrate,
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
							cleanup();
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

						// Activate video playback on segment change
						if (currentActiveIndex !== prevActiveIndex) {
							activateSlotVideo(activeSlot);
							prevActiveIndex = currentActiveIndex;
						} else {
							// Ensure active video is playing if paused
							const activeVid = preloadedVideos.get(activeSlot);
							if (activeVid && activeVid.paused && !activeVid.ended) {
								activeVid.play().catch(() => {});
							}
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
						cleanup();
						reject(loopErr);
					}
				}

				function finishEncoding() {
					cleanup();

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

		const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: options.bitrate || 6_000_000 });
		const chunks: Blob[] = [];

		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunks.push(e.data);
		};

		recorder.onstop = () => {
			cleanup();
			if (chunks.length === 0) {
				reject(new Error('MediaRecorder: no chunks produced'));
				return;
			}
			const blob = new Blob(chunks, { type: mimeType });
			if (onProgress) onProgress(100);
			resolve({ blob, url: URL.createObjectURL(blob) });
		};

		recorder.onerror = (e) => {
			cleanup();
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
				activateSlotVideo(activeSlot);
				prevActiveIndex = currentActiveIndex;
			} else {
				const activeVid = preloadedVideos.get(activeSlot);
				if (activeVid && activeVid.paused && !activeVid.ended) {
					activeVid.play().catch(() => {});
				}
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

