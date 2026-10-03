import QRCode from 'qrcode';
import type { FrameLayout, PhotoItem, StickerItem } from '$lib/types';

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		if (!src.startsWith('data:') && !src.startsWith('blob:')) {
			img.crossOrigin = 'anonymous';
		}
		img.onload = () => resolve(img);
		img.onerror = (e) => reject(e);
		img.src = src;
	});
}

export function recordPrintLog(msg: string) {
	try {
		console.log('[ReceiptDebug]', msg);
		if (typeof window !== 'undefined') {
			const existing = JSON.parse(sessionStorage.getItem('chekiyuume_print_debug') || '[]');
			existing.push(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
			sessionStorage.setItem('chekiyuume_print_debug', JSON.stringify(existing.slice(-100)));
		}
	} catch (_) {}
}



export interface RenderOptions {
	layout: FrameLayout;
	photos: PhotoItem[];
	slotPhotoIds: (string | null)[];
	stickers?: StickerItem[];
	guestName?: string;
	sessionId?: string;
	brandingTitle?: string;
	brandingSubtitle?: string;
	showTimestamp?: boolean;
	shareUrl?: string;
	isForPrint?: boolean;
}

/**
 * Draws rounded rectangle path on canvas
 */
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

/**
 * Draws vintage rubber PAID stamp effect on the receipt
 */
function drawReceiptStamp(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	dateStr: string
) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(-0.13); // -7.5 degrees tilt
	ctx.strokeStyle = '#111111';
	ctx.lineWidth = 4.5;

	// Outer stamp border
	drawRoundedRect(ctx, -140, -44, 280, 88, 8);
	ctx.stroke();

	// Inner stamp border
	ctx.lineWidth = 2;
	drawRoundedRect(ctx, -134, -38, 268, 76, 6);
	ctx.stroke();

	ctx.fillStyle = '#111111';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 32px "Outfit", "Courier New", monospace';
	ctx.letterSpacing = '3px';
	ctx.fillText('★ P A I D ★', 0, -10);

	ctx.font = '700 20px "Courier New", Courier, monospace';
	ctx.letterSpacing = '1px';
	ctx.fillText(dateStr, 0, 18);

	ctx.restore();
}

/**
 * Helper to draw crisp thermal receipt divider lines
 */
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
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(startX, y - 3);
		ctx.lineTo(endX, y - 3);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(startX, y + 4);
		ctx.lineTo(endX, y + 4);
		ctx.stroke();
	} else if (style === 'dash') {
		ctx.lineWidth = 3.5;
		ctx.setLineDash([14, 10]);
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(endX, y);
		ctx.stroke();
	} else {
		ctx.lineWidth = 3.5;
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(endX, y);
		ctx.stroke();
	}
	ctx.restore();
}

/**
 * Draws simulated realistic barcode pattern
 */
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

/**
 * Renders high-resolution composite photostrip canvas
 */
export async function renderPhotostripCanvas(options: RenderOptions): Promise<HTMLCanvasElement> {
	const {
		layout,
		photos,
		slotPhotoIds,
		stickers = [],
		guestName = '',
		sessionId = '',
		brandingTitle = 'CHEKIYUUME',
		brandingSubtitle = 'PHOTOBOOTH STUDIO',
		showTimestamp = true
	} = options;

	const isThematicReceipt = layout.id.startsWith('thematic-receipt') || (layout as any).mode === 'thematic';

	// Physical print receipt is taller (4020px) to accommodate the download QR code.
	// Digital asset receipt is standard height (3620px) without the QR code.
	const effectiveCanvasHeight = (isThematicReceipt && options.isForPrint) ? 4020 : (isThematicReceipt ? 3620 : layout.canvasHeight);

	const canvas = document.createElement('canvas');
	canvas.width = layout.canvasWidth;
	canvas.height = effectiveCanvasHeight;
	const ctx = canvas.getContext('2d', { alpha: false });

	if (!ctx) {
		throw new Error('Canvas 2D context creation failed');
	}

	let qrCanvas: HTMLCanvasElement | null = null;
	let qrError: string | null = null;
	if (isThematicReceipt && options.isForPrint) {
		recordPrintLog(`[canvasRenderer] Preparing print QR: layout=${layout.id}, sessionId=${sessionId || 'NONE'}`);
		const targetShareUrl = options.shareUrl || (
			sessionId
				? (typeof window !== 'undefined' ? `${window.location.origin}/share/${sessionId}` : `https://chekiyuume.app/share/${sessionId}`)
				: 'https://chekiyuume.app'
		);
		recordPrintLog(`[canvasRenderer] QR targetShareUrl=${targetShareUrl}`);

		try {
			// Primary method: direct toCanvas
			const tempCanvas = document.createElement('canvas');
			await QRCode.toCanvas(tempCanvas, targetShareUrl, {
				width: 320,
				margin: 1,
				color: {
					dark: '#000000',
					light: '#ffffff'
				},
				errorCorrectionLevel: 'M'
			});
			if (tempCanvas && tempCanvas.width > 0) {
				qrCanvas = tempCanvas;
				recordPrintLog(`[canvasRenderer] QRCode.toCanvas success (${tempCanvas.width}x${tempCanvas.height})`);
			} else {
				throw new Error('toCanvas created empty canvas');
			}
		} catch (primaryErr: any) {
			const errMsg = String(primaryErr?.message || primaryErr);
			recordPrintLog(`[canvasRenderer] QRCode.toCanvas failed: ${errMsg}. Trying toDataURL fallback...`);
			try {
				const qrDataUrl = await QRCode.toDataURL(targetShareUrl, {
					width: 320,
					margin: 1,
					color: { dark: '#000000', light: '#ffffff' },
					errorCorrectionLevel: 'M'
				});
				const img = await loadImage(qrDataUrl);
				const fallbackCanvas = document.createElement('canvas');
				fallbackCanvas.width = img.width || 320;
				fallbackCanvas.height = img.height || 320;
				const fctx = fallbackCanvas.getContext('2d');
				if (fctx) {
					fctx.drawImage(img, 0, 0);
					qrCanvas = fallbackCanvas;
					recordPrintLog(`[canvasRenderer] QRCode toDataURL fallback success`);
				}
			} catch (fallbackErr: any) {
				qrError = String(fallbackErr?.message || fallbackErr);
				recordPrintLog(`[canvasRenderer] CRITICAL: Both QR methods failed: ${qrError}`);
				console.error('[canvasRenderer] All QR generation methods failed:', fallbackErr);
			}
		}
	}

	// 1. Draw Background (guaranteed fill full effective height with solid white to eliminate thermal printer black box)
	ctx.fillStyle = layout.backgroundColor || '#FFFFFF';
	ctx.fillRect(0, 0, layout.canvasWidth, effectiveCanvasHeight);

	// If there is a background image overlay
	if (layout.backgroundUrl) {
		try {
			const bgImg = await loadImage(layout.backgroundUrl);
			ctx.drawImage(bgImg, 0, 0, layout.canvasWidth, effectiveCanvasHeight);
		} catch (e) {
			console.warn('Failed to load background template image', e);
		}
	}

	// 2. Receipt Header (for Thematic Receipt layout - ChekiYuume Mart)
	if (isThematicReceipt) {
		ctx.save();
		ctx.fillStyle = '#111111';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';

		const centerX = layout.canvasWidth / 2;
		const marginX = 54;
		const endX = layout.canvasWidth - marginX;

		// 2a. Store Header (Enlarged for 58mm thermal print readability)
		ctx.font = '900 64px "Outfit", "Arial Black", sans-serif';
		ctx.letterSpacing = '3px';
		ctx.fillText(`*** ${(brandingTitle || 'CHEKIYUUME').toUpperCase()} MART ★ ***`, centerX, 28);

		ctx.font = '700 32px "Courier New", Courier, monospace';
		ctx.letterSpacing = '2px';
		ctx.fillStyle = '#222222';
		ctx.fillText(`*** CONVENIENCE & PHOTO STUDIO ***`, centerX, 96);

		ctx.font = '700 28px "Courier New", Courier, monospace';
		ctx.letterSpacing = '1px';
		ctx.fillStyle = '#333333';
		ctx.fillText(`STORE #0397 • SHIMOKITA BRANCH`, centerX, 136);

		// Double Divider
		drawReceiptDivider(ctx, marginX, endX, 175, 'double');

		// 2b. Info Rows (monospaced receipt style - 32px bold)
		const now = new Date();
		const dateStr = now.toLocaleDateString('id-ID', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		}).toUpperCase();
		const timeStr = now.toLocaleTimeString('id-ID', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		const transCode = (sessionId ? sessionId.slice(-8) : '4812-9YMC').toUpperCase();

		ctx.textAlign = 'left';
		ctx.font = '700 32px "Courier New", Courier, monospace';
		ctx.fillStyle = '#111111';
		ctx.fillText(`DATE : ${dateStr} ${timeStr}`, marginX + 15, 192);
		ctx.fillText(`TRANS: #TR-${transCode}`, marginX + 15, 230);
		ctx.fillText(`CASHR: ${(guestName ? guestName.toUpperCase() : 'BESTIE').slice(0, 14)}`, marginX + 15, 268);

		ctx.textAlign = 'right';
		ctx.fillText(`POS  : #01`, endX - 15, 192);
		ctx.fillText(`REG  : MEMORY`, endX - 15, 230);
		ctx.fillText(`ITEMS: 3 CUTS`, endX - 15, 268);

		// Double Divider
		drawReceiptDivider(ctx, marginX, endX, 310, 'double');

		// 2c. Section Header
		ctx.textAlign = 'center';
		ctx.font = '700 30px "Courier New", Courier, monospace';
		ctx.letterSpacing = '1px';
		ctx.fillText(`=== GROCERY ITEM : PHOTOSTRIP ===`, centerX, 325);

		drawReceiptDivider(ctx, marginX, endX, 365, 'solid');

		ctx.restore();
	}

	// 3. Map photos to slots
	const photoMap = new Map<string, PhotoItem>();
	photos.forEach((p) => photoMap.set(p.id, p));

	// 3. Render Each Slot
	for (let i = 0; i < layout.slots.length; i++) {
		const slot = layout.slots[i];
		const assignedId = slotPhotoIds[i] || (photos[i] ? photos[i].id : null);
		const photoItem = assignedId ? photoMap.get(assignedId) : null;

		ctx.save();

		// Create slot clip path (with rounded corners for default, crisp rectangles for receipt)
		const radius = isThematicReceipt ? 0 : (slot.borderRadius ?? 12);
		if (radius > 0) {
			drawRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, radius);
			ctx.clip();
		} else {
			ctx.beginPath();
			ctx.rect(slot.x, slot.y, slot.width, slot.height);
			ctx.clip();
		}

		if (photoItem && photoItem.dataUrl) {
			try {
				const img = await loadImage(photoItem.dataUrl);

				// Center-crop 4:3 algorithm
				const targetAspect = slot.width / slot.height;
				let cropWidth = img.width;
				let cropHeight = cropWidth / targetAspect;

				if (cropHeight > img.height) {
					cropHeight = img.height;
					cropWidth = cropHeight * targetAspect;
				}

				const sx = (img.width - cropWidth) / 2;
				const sy = (img.height - cropHeight) / 2;

				ctx.drawImage(
					img,
					sx,
					sy,
					cropWidth,
					cropHeight,
					slot.x,
					slot.y,
					slot.width,
					slot.height
				);
			} catch (err) {
				console.error(`Failed to draw photo in slot ${i}`, err);
			}
		} else {
			// Placeholder for empty slot
			ctx.fillStyle = '#27272A';
			ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
			ctx.fillStyle = '#71717A';
			ctx.font = '600 36px "Plus Jakarta Sans", sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(`Foto ${i + 1}`, slot.x + slot.width / 2, slot.y + slot.height / 2);
		}

		ctx.restore();

		// Border outline for photo slots
		if (isThematicReceipt) {
			ctx.save();
			// Crisp solid border
			// Crisp solid border
			ctx.strokeStyle = '#111111';
			ctx.lineWidth = 4;
			ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);

			// Decorative slot item tag (Enlarged)
			const slotBadge = i === 0 ? 'ITEM #01 [SNAP]' : i === 1 ? 'ITEM #02 [BEST POSE]' : 'ITEM #03 [MEMORIES]';
			ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
			ctx.fillRect(slot.x + 14, slot.y + 14, 250, 40);
			ctx.fillStyle = '#FFFFFF';
			ctx.font = '700 22px "Courier New", Courier, monospace';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			ctx.fillText(slotBadge, slot.x + 24, slot.y + 34);
			ctx.restore();
		}
	}

	// 4. Draw Overlay Frame Artwork (if any)
	if (layout.overlayUrl) {
		try {
			const overlayImg = await loadImage(layout.overlayUrl);
			ctx.drawImage(overlayImg, 0, 0, layout.canvasWidth, layout.canvasHeight);
		} catch (e) {
			console.warn('Failed to load frame overlay image', e);
		}
	}

	// 5. Draw Stickers (if any)
	if (stickers && stickers.length > 0) {
		for (const st of stickers) {
			ctx.save();
			const px = (st.x / 100) * layout.canvasWidth;
			const py = (st.y / 100) * layout.canvasHeight;
			ctx.translate(px, py);
			if (st.rotation) {
				ctx.rotate((st.rotation * Math.PI) / 180);
			}
			ctx.font = `${st.size || 80}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(st.emoji, 0, 0);
			ctx.restore();
		}
	}

	// 6. Draw Footer / Branding Area
	if (isThematicReceipt) {
		ctx.save();
		const footerTop = 2560;
		const centerX = layout.canvasWidth / 2;
		const marginX = 54;
		const endX = layout.canvasWidth - marginX;
		const transCode = (sessionId ? sessionId.slice(-8) : '4812-9YMC').toUpperCase();

		const now = new Date();
		const dateStr = now.toLocaleDateString('id-ID', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		}).toUpperCase();

		ctx.save();
		ctx.textBaseline = 'top';

		// Top double divider of grocery table
		drawReceiptDivider(ctx, marginX, endX, footerTop + 15, 'double');

		// Table Header Title
		ctx.textAlign = 'center';
		ctx.fillStyle = '#111111';
		ctx.font = '800 36px "Courier New", Courier, monospace';
		ctx.letterSpacing = '1px';
		ctx.fillText(`=== GROCERY ITEMS ===`, centerX, footerTop + 32);

		// Column Header (2-column layout: ITEM DESCRIPTION & TOTAL)
		ctx.textAlign = 'left';
		ctx.font = '700 34px "Courier New", Courier, monospace';
		ctx.fillText(`ITEM DESCRIPTION`, marginX + 15, footerTop + 78);
		ctx.textAlign = 'right';
		ctx.fillText(`TOTAL`, endX - 15, footerTop + 78);

		// Divider
		drawReceiptDivider(ctx, marginX, endX, footerTop + 118, 'solid');

		// Grocery Items (Clean 2-column format)
		const items = [
			{ name: '3X PHOTOSTRIP MOMENTS', price: 'PRICELESS' },
			{ name: '01X BTS LIVE VIDEO', price: 'FREE' },
			{ name: 'UNLIMITED SWEET SMILES', price: 'Rp 0' },
			{ name: 'GOOD VIBES ONLY', price: 'Rp 0' }
		];

		ctx.font = '700 34px "Courier New", Courier, monospace';
		let itemY = footerTop + 135;
		items.forEach((it) => {
			ctx.textAlign = 'left';
			ctx.fillStyle = '#111111';
			ctx.fillText(it.name, marginX + 15, itemY);
			ctx.textAlign = 'right';
			ctx.fillText(it.price, endX - 15, itemY);
			itemY += 48;
		});

		// Divider
		drawReceiptDivider(ctx, marginX, endX, itemY + 10, 'solid');

		// Subtotal & Discount
		ctx.font = '700 32px "Courier New", Courier, monospace';
		ctx.textAlign = 'left';
		ctx.fillText(`SUBTOTAL`, marginX + 15, itemY + 26);
		ctx.textAlign = 'right';
		ctx.fillText(`Rp 0`, endX - 15, itemY + 26);

		ctx.textAlign = 'left';
		ctx.fillText(`DISCOUNT BESTIE (100%)`, marginX + 15, itemY + 66);
		ctx.textAlign = 'right';
		ctx.fillText(`-Rp 0`, endX - 15, itemY + 66);

		// Double separator
		drawReceiptDivider(ctx, marginX, endX, itemY + 112, 'double');

		// Total line
		ctx.textAlign = 'left';
		ctx.font = '900 46px "Outfit", "Courier New", monospace';
		ctx.fillStyle = '#111111';
		ctx.fillText(`TOTAL HAPPINESS`, marginX + 15, itemY + 130);
		ctx.textAlign = 'right';
		ctx.fillText(`PRICELESS`, endX - 15, itemY + 130);

		ctx.textAlign = 'left';
		ctx.font = '700 32px "Courier New", Courier, monospace';
		ctx.fillText(`PAYMENT : CASH OF MEMORIES`, marginX + 15, itemY + 188);

		// Stamp PAID (stamped over right side)
		drawReceiptStamp(ctx, centerX + 260, itemY + 170, dateStr);

		if (options.isForPrint) {
			// ========================================================
			// PHYSICAL PRINT MODE: Includes Scannable Download QR Code
			// ========================================================
			const qrSectionY = itemY + 235;
			drawReceiptDivider(ctx, marginX, endX, qrSectionY, 'double');

			// QR Code Section Headers
			ctx.textAlign = 'center';
			ctx.font = '800 32px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText('SCAN TO DOWNLOAD DIGITAL PHOTO & VIDEO', centerX, qrSectionY + 25);

			ctx.font = '700 24px "Courier New", Courier, monospace';
			ctx.fillStyle = '#333333';
			ctx.fillText('* HIGH-RES DIGITAL ASSETS • CLOUD SYNC *', centerX, qrSectionY + 65);

			// Draw QR Code centered (260x260)
			const qrSize = 260;
			const qrX = centerX - qrSize / 2;
			const qrY = qrSectionY + 105;

			if (qrCanvas) {
				ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
			} else {
				// Visual fallback
				ctx.save();
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(qrX, qrY, qrSize, qrSize);
				ctx.strokeStyle = '#111111';
				ctx.lineWidth = 4;
				ctx.strokeRect(qrX, qrY, qrSize, qrSize);
				ctx.fillStyle = '#111111';
				ctx.font = 'bold 22px monospace';
				ctx.fillText('CHEKIYUUME QR', centerX, qrY + 125);
				ctx.restore();
			}

			// Order / Session ID snippet below QR
			const transNoticeY = qrY + qrSize + 22;
			ctx.font = '700 26px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText(`* TR-${transCode} • EXPIRES IN 48 HOURS *`, centerX, transNoticeY);

			// Barcode Section
			const barcodeSectionY = transNoticeY + 45;
			drawReceiptDivider(ctx, marginX, endX, barcodeSectionY, 'double');

			const barcodeY = barcodeSectionY + 30;
			drawBarcode(ctx, centerX, barcodeY, 720, 85, sessionId);

			const barcodeNumY = barcodeY + 95;
			ctx.font = '700 28px "Courier New", Courier, monospace';
			ctx.fillStyle = '#222222';
			ctx.fillText(`4  9 0 1 2 3 4   5 6 7 8 9 0      TRAN# ${transCode}`, centerX, barcodeNumY);

			// Store Policy Divider
			const policyY = barcodeNumY + 45;
			drawReceiptDivider(ctx, marginX, endX, policyY, 'solid');

			// Store Policy Note
			ctx.font = '700 30px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText('"Kenangan yang sudah dibeli tidak dapat', centerX, policyY + 24);
			ctx.fillText('ditukar atau dilupakan seumur hidup!"', centerX, policyY + 60);

			// Thank You Note & Recyclable Thermal note
			const thankYouY = policyY + 105;
			drawReceiptDivider(ctx, marginX, endX, thankYouY, 'solid');

			ctx.font = '900 34px "Outfit", "Courier New", sans-serif';
			ctx.letterSpacing = '2px';
			ctx.fillText(`*** THANK YOU FOR VISITING! SEE YOU SOON ***`, centerX, thankYouY + 24);

			ctx.font = '700 24px "Courier New", Courier, monospace';
			ctx.letterSpacing = '1px';
			ctx.fillStyle = '#444444';
			ctx.fillText(`* 100% RECYCLABLE THERMAL PAPER *`, centerX, thankYouY + 68);

			ctx.font = '800 28px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText(`IG: @CHEKIYUUME • WWW.CHEKIYUUME.COM`, centerX, thankYouY + 106);
		} else {
			// ========================================================
			// DIGITAL ASSET MODE: Privacy-Safe Barcode (NO QR CODE)
			// ========================================================
			const barcodeSectionY = itemY + 235;
			drawReceiptDivider(ctx, marginX, endX, barcodeSectionY, 'double');

			// Barcode Section
			const barcodeY = barcodeSectionY + 30;
			drawBarcode(ctx, centerX, barcodeY, 720, 85, sessionId);

			const barcodeNumY = barcodeY + 95;
			ctx.textAlign = 'center';
			ctx.font = '700 28px "Courier New", Courier, monospace';
			ctx.fillStyle = '#222222';
			ctx.fillText(`4  9 0 1 2 3 4   5 6 7 8 9 0      TRAN# ${transCode}`, centerX, barcodeNumY);

			// Store Policy Divider
			const policyY = barcodeNumY + 45;
			drawReceiptDivider(ctx, marginX, endX, policyY, 'solid');

			// Store Policy Note
			ctx.font = '700 30px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText('"Kenangan yang sudah dibeli tidak dapat', centerX, policyY + 24);
			ctx.fillText('ditukar atau dilupakan seumur hidup!"', centerX, policyY + 60);

			// Thank You Note & Recyclable Thermal note
			const thankYouY = policyY + 105;
			drawReceiptDivider(ctx, marginX, endX, thankYouY, 'solid');

			ctx.font = '900 34px "Outfit", "Courier New", sans-serif';
			ctx.letterSpacing = '2px';
			ctx.fillText(`*** THANK YOU FOR VISITING! SEE YOU SOON ***`, centerX, thankYouY + 24);

			ctx.font = '700 24px "Courier New", Courier, monospace';
			ctx.letterSpacing = '1px';
			ctx.fillStyle = '#444444';
			ctx.fillText(`* 100% RECYCLABLE THERMAL PAPER *`, centerX, thankYouY + 68);

			ctx.font = '800 28px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText(`IG: @CHEKIYUUME • WWW.CHEKIYUUME.COM`, centerX, thankYouY + 106);
		}

		ctx.restore();
	} else if (!layout.id.startsWith('default-') && !layout.overlayUrl) {
		const isDarkBg = layout.backgroundColor.toLowerCase() === '#18181b' || layout.backgroundColor.toLowerCase() === '#000000';
		const textColor = isDarkBg ? '#F4F4F5' : '#18181B';
		const subTextColor = isDarkBg ? '#A1A1AA' : '#71717A';

		const footerTop = layout.canvasHeight - layout.footerHeight;
		const centerX = layout.canvasWidth / 2;

		ctx.save();

		// Main Branding Title
		ctx.fillStyle = textColor;
		ctx.font = '800 48px "Outfit", sans-serif';
		ctx.textAlign = 'center';
		ctx.letterSpacing = '4px';
		ctx.fillText(brandingTitle.toUpperCase(), centerX, footerTop + 90);

		// Subtitle / Event / Guest Name
		ctx.fillStyle = subTextColor;
		ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
		ctx.letterSpacing = '2px';
		const displaySub = guestName ? `${guestName.toUpperCase()} • ${brandingSubtitle.toUpperCase()}` : brandingSubtitle.toUpperCase();
		ctx.fillText(displaySub, centerX, footerTop + 140);

		// Date & Session ID
		if (showTimestamp) {
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

			ctx.font = '500 20px "Plus Jakarta Sans", monospace';
			ctx.fillStyle = subTextColor;
			const idSnippet = sessionId ? `[${sessionId.slice(-9)}]` : '';
			ctx.fillText(`${dateStr} ${timeStr} ${idSnippet}`, centerX, footerTop + 185);
		}

		ctx.restore();
	}

	return canvas;
}

/**
 * Export canvas to PNG Data URL and Blob
 */
export function exportPhotostrip(canvas: HTMLCanvasElement): { dataUrl: string; blob: Promise<Blob> } {
	const dataUrl = canvas.toDataURL('image/png');
	const blob = new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((b) => {
			if (b) resolve(b);
			else reject(new Error('Export to blob failed'));
		}, 'image/png');
	});
	return { dataUrl, blob };
}
