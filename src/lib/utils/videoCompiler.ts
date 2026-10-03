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
		if (!src.startsWith('data:') && !src.startsWith('blob:')) {
			img.crossOrigin = 'anonymous';
		}
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

function drawBarcode(
	ctx: CanvasRenderingContext2D,
	centerX: number,
	topY: number,
	width: number,
	height: number,
	code: string
) {
	ctx.save();
	ctx.fillStyle = '#111111';
	const startX = centerX - width / 2;
	const barWidth = 3;
	let curX = startX;
	const pattern = [2, 1, 3, 1, 2, 4, 1, 2, 3, 2, 1, 4, 2, 1, 3, 1, 4, 2, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4];
	let pIdx = 0;
	while (curX < startX + width) {
		const w = (pattern[pIdx % pattern.length] || 2) * barWidth;
		if (pIdx % 2 === 0) {
			ctx.fillRect(curX, topY, Math.min(w, startX + width - curX), height);
		}
		curX += w + (pIdx % 3 === 0 ? 3 : 2);
		pIdx++;
	}
	ctx.restore();
}

function drawReceiptStamp(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	dateStr: string
) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(-0.13);
	ctx.strokeStyle = '#111111';
	ctx.lineWidth = 4;
	drawRoundedRect(ctx, -125, -38, 250, 76, 8);
	ctx.stroke();
	ctx.lineWidth = 1.5;
	drawRoundedRect(ctx, -120, -33, 240, 66, 6);
	ctx.stroke();
	ctx.fillStyle = '#111111';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 28px "Outfit", "Courier New", monospace';
	ctx.letterSpacing = '3px';
	ctx.fillText('★ P A I D ★', 0, -8);
	ctx.font = '700 16px "Courier New", Courier, monospace';
	ctx.letterSpacing = '1px';
	ctx.fillText(dateStr, 0, 18);
	ctx.restore();
}

function drawReceiptDivider(
	ctx: CanvasRenderingContext2D,
	startX: number,
	endX: number,
	y: number,
	style: 'solid' | 'double' | 'dash' = 'solid'
) {
	ctx.save();
	ctx.strokeStyle = '#111111';
	if (style === 'double') {
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(startX, y - 2);
		ctx.lineTo(endX, y - 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(startX, y + 3);
		ctx.lineTo(endX, y + 3);
		ctx.stroke();
	} else if (style === 'dash') {
		ctx.lineWidth = 2.5;
		ctx.setLineDash([12, 8]);
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(endX, y);
		ctx.stroke();
	} else {
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(endX, y);
		ctx.stroke();
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

	// 2. Receipt Header (for Thematic Receipt - ChekiYuume Mart)
	if (isThematicReceipt) {
		ctx.save();
		ctx.fillStyle = '#111111';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';

		const centerX = origWidth / 2;
		const marginX = 54;
		const endX = origWidth - marginX;

		// 2a. Store Header
		ctx.font = '900 50px "Outfit", "Arial Black", sans-serif';
		ctx.letterSpacing = '3px';
		ctx.fillText(`*** ${(brandingTitle || 'CHEKIYUUME').toUpperCase()} MART ★ ***`, centerX, 35);

		ctx.font = '700 24px "Courier New", Courier, monospace';
		ctx.letterSpacing = '2px';
		ctx.fillStyle = '#222222';
		ctx.fillText(`*** CONVENIENCE & PHOTO STUDIO ***`, centerX, 92);

		ctx.font = '700 22px "Courier New", Courier, monospace';
		ctx.letterSpacing = '1px';
		ctx.fillStyle = '#333333';
		ctx.fillText(`STORE #0397 • SHIMOKITA BRANCH`, centerX, 124);

		drawReceiptDivider(ctx, marginX, endX, 160, 'double');

		const transCode = (sessionId ? sessionId.slice(-8) : '4812-9YMC').toUpperCase();

		ctx.textAlign = 'left';
		ctx.font = '700 24px "Courier New", Courier, monospace';
		ctx.fillStyle = '#111111';
		ctx.fillText(`DATE : ${dateStr} ${timeStr}`, marginX + 15, 180);
		ctx.fillText(`TRANS: #TR-${transCode}`, marginX + 15, 218);
		ctx.fillText(`CASHR: ${(guestName ? guestName.toUpperCase() : 'BESTIE').slice(0, 16)}`, marginX + 15, 256);

		ctx.textAlign = 'right';
		ctx.fillText(`POS  : #01`, endX - 15, 180);
		ctx.fillText(`REG  : MEMORY`, endX - 15, 218);
		ctx.fillText(`ITEMS: 3 CUTS`, endX - 15, 256);

		drawReceiptDivider(ctx, marginX, endX, 295, 'double');

		ctx.textAlign = 'center';
		ctx.font = '700 24px "Courier New", Courier, monospace';
		ctx.letterSpacing = '1px';
		ctx.fillText(`=== GROCERY ITEM : PHOTOSTRIP ===`, centerX, 315);

		drawReceiptDivider(ctx, marginX, endX, 350, 'solid');

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

		// Border outline for receipt photo slots
		if (isThematicReceipt) {
			ctx.save();
			ctx.strokeStyle = '#111111';
			ctx.lineWidth = 3.5;
			ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);

			const slotBadge = i === 0 ? 'ITEM #01 [SNAP]' : i === 1 ? 'ITEM #02 [BEST POSE]' : 'ITEM #03 [MEMORIES]';
			ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
			ctx.fillRect(slot.x + 14, slot.y + 14, 210, 32);
			ctx.fillStyle = '#FFFFFF';
			ctx.font = '700 16px "Courier New", Courier, monospace';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			ctx.fillText(slotBadge, slot.x + 24, slot.y + 30);
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
		const marginX = 54;
		const endX = origWidth - marginX;
		const transCode = (sessionId ? sessionId.slice(-8) : '4812-9YMC').toUpperCase();

		ctx.save();
		ctx.textBaseline = 'top';

		// Top double divider of grocery table
		drawReceiptDivider(ctx, marginX, endX, footerTop + 20, 'double');

		// Table Header Title
		ctx.textAlign = 'center';
		ctx.fillStyle = '#111111';
		ctx.font = '700 26px "Courier New", Courier, monospace';
		ctx.letterSpacing = '1px';
		ctx.fillText(`=== GROCERY ITEMS ===`, centerX, footerTop + 35);

		// Column Header
		ctx.textAlign = 'left';
		ctx.font = '700 24px "Courier New", Courier, monospace';
		ctx.fillText(`ITEM DESCRIPTION`, marginX + 15, footerTop + 75);
		ctx.textAlign = 'right';
		ctx.fillText(`QTY   PRICE`, endX - 15, footerTop + 75);

		// Divider
		drawReceiptDivider(ctx, marginX, endX, footerTop + 108, 'solid');

		// Grocery Items
		const items = [
			{ name: '3X PHOTOSTRIP MOMENTS', qty: '01', price: 'PRICELESS' },
			{ name: '01X BTS LIVE VIDEO', qty: '01', price: 'FREE' },
			{ name: 'UNLIMITED SWEET SMILES', qty: '01', price: 'Rp 0' },
			{ name: 'GOOD VIBES ONLY', qty: '01', price: 'Rp 0' }
		];

		ctx.font = '600 24px "Courier New", Courier, monospace';
		let itemY = footerTop + 125;
		items.forEach((it) => {
			ctx.textAlign = 'left';
			ctx.fillStyle = '#111111';
			ctx.fillText(it.name, marginX + 15, itemY);
			ctx.textAlign = 'right';
			ctx.fillText(`${it.qty}  ${it.price}`, endX - 15, itemY);
			itemY += 35;
		});

		// Divider
		drawReceiptDivider(ctx, marginX, endX, itemY + 8, 'solid');

		// Subtotal & Discount
		ctx.font = '600 24px "Courier New", Courier, monospace';
		ctx.textAlign = 'left';
		ctx.fillText(`SUBTOTAL`, marginX + 15, itemY + 22);
		ctx.textAlign = 'right';
		ctx.fillText(`Rp 0`, endX - 15, itemY + 22);

		ctx.textAlign = 'left';
		ctx.fillText(`DISCOUNT BESTIE (100%)`, marginX + 15, itemY + 54);
		ctx.textAlign = 'right';
		ctx.fillText(`-Rp 0`, endX - 15, itemY + 54);

		// Double separator
		drawReceiptDivider(ctx, marginX, endX, itemY + 92, 'double');

		// Total line
		ctx.textAlign = 'left';
		ctx.font = '900 30px "Outfit", "Courier New", monospace';
		ctx.fillStyle = '#111111';
		ctx.fillText(`TOTAL HAPPINESS`, marginX + 15, itemY + 110);
		ctx.textAlign = 'right';
		ctx.fillText(`PRICELESS`, endX - 15, itemY + 110);

		ctx.textAlign = 'left';
		ctx.font = '700 22px "Courier New", Courier, monospace';
		ctx.fillText(`PAYMENT : CASH OF MEMORIES`, marginX + 15, itemY + 148);

		// Stamp PAID
		drawReceiptStamp(ctx, centerX + 260, itemY + 130, dateStr);

		// Double Divider
		const barcodeSectionY = itemY + 195;
		drawReceiptDivider(ctx, marginX, endX, barcodeSectionY, 'double');

		// Barcode Section
		const barcodeY = barcodeSectionY + 30;
		drawBarcode(ctx, centerX, barcodeY, 680, 80, sessionId);

		const barcodeNumY = barcodeY + 90;
		ctx.textAlign = 'center';
		ctx.font = '700 22px "Courier New", Courier, monospace';
		ctx.fillStyle = '#222222';
		ctx.fillText(`4  9 0 1 2 3 4   5 6 7 8 9 0      TRAN# ${transCode}`, centerX, barcodeNumY);

		// Store Policy Divider
		const policyY = barcodeNumY + 40;
		drawReceiptDivider(ctx, marginX, endX, policyY, 'solid');

		// Store Policy Note
		ctx.font = '700 22px "Courier New", Courier, monospace';
		ctx.fillStyle = '#111111';
		ctx.fillText('"Kenangan yang sudah dibeli tidak dapat', centerX, policyY + 24);
		ctx.fillText('ditukar atau dilupakan seumur hidup!"', centerX, policyY + 52);

		// Thank You Note
		ctx.font = '900 26px "Outfit", "Courier New", sans-serif';
		ctx.letterSpacing = '2px';
		ctx.fillText(`*** THANK YOU FOR VISITING! SEE YOU SOON ***`, centerX, policyY + 98);

		ctx.font = '700 18px "Courier New", Courier, monospace';
		ctx.letterSpacing = '1px';
		ctx.fillStyle = '#444444';
		ctx.fillText(`* 100% RECYCLABLE THERMAL PAPER *`, centerX, policyY + 132);

		ctx.font = '800 22px "Courier New", Courier, monospace';
		ctx.fillStyle = '#111111';
		ctx.fillText(`IG: @CHEKIYUUME • WWW.CHEKIYUUME.COM`, centerX, policyY + 160);

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

