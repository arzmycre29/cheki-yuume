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
		ctx.lineWidth = 4.5;
		ctx.beginPath();
		ctx.moveTo(startX, y - 4);
		ctx.lineTo(endX, y - 4);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(startX, y + 4);
		ctx.lineTo(endX, y + 4);
		ctx.stroke();
	} else if (style === 'dash') {
		ctx.lineWidth = 4.5;
		ctx.setLineDash([18, 12]);
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(endX, y);
		ctx.stroke();
	} else {
		ctx.lineWidth = 4.5;
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

	// Physical print receipt is taller (4350px) to accommodate extra-large fonts and scannable QR code.
	// Digital asset receipt is standard height (3800px) without the QR code.
	const effectiveCanvasHeight = (isThematicReceipt && options.isForPrint) ? 4350 : (isThematicReceipt ? 3800 : layout.canvasHeight);

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

	// 2. Receipt Header (Clean Aesthetic Receipt - Option 1)
	if (isThematicReceipt) {
		ctx.save();
		ctx.fillStyle = '#111111';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';

		const centerX = layout.canvasWidth / 2;
		const marginX = 54;
		const endX = layout.canvasWidth - marginX;

		// 2a. Store Branding (Extra-large bold monospace)
		ctx.font = '800 100px "Courier New", Courier, monospace';
		ctx.letterSpacing = '3px';
		ctx.fillText((brandingTitle || 'CHEKIYUUME').toUpperCase(), centerX, 45);

		ctx.font = '700 48px "Courier New", Courier, monospace';
		ctx.letterSpacing = '1px';
		ctx.fillStyle = '#222222';
		ctx.fillText((brandingSubtitle || 'PHOTOBOOTH STUDIO').toUpperCase(), centerX, 160);

		// Single Dash Divider
		drawReceiptDivider(ctx, marginX, endX, 230, 'dash');

		// 2b. Metadata Rows (Extra-large 54px monospace, stacked cleanly)
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
		const transCode = (sessionId ? sessionId.slice(-8) : 'R095UJLG').toUpperCase();

		ctx.font = '700 54px "Courier New", Courier, monospace';
		ctx.fillStyle = '#111111';

		// Row 1: Date & Time
		ctx.textAlign = 'left';
		ctx.fillText(`DATE : ${dateStr} ${timeStr}`, marginX + 15, 255);

		// Row 2: Order
		ctx.fillText(`ORDER: #TR-${transCode}`, marginX + 15, 325);

		// Row 3: POS & Cuts
		ctx.fillText(`POS  : #01`, marginX + 15, 395);
		ctx.textAlign = 'right';
		ctx.fillText(`CUTS : 3`, endX - 15, 395);

		// Row 4: Guest
		ctx.textAlign = 'left';
		ctx.fillText(`GUEST: ${(guestName ? guestName.toUpperCase() : 'FRIEND').slice(0, 14)}`, marginX + 15, 465);

		// Divider before photos
		drawReceiptDivider(ctx, marginX, endX, 545, 'dash');

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

		// Border outline for photo slots (Clean, no floating badges)
		if (isThematicReceipt) {
			ctx.save();
			ctx.strokeStyle = '#111111';
			ctx.lineWidth = 4;
			ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);
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

	// 6. Draw Footer (Clean Aesthetic Receipt - Extra-Large Monospace)
	if (isThematicReceipt) {
		const footerTop = 2930;
		const centerX = layout.canvasWidth / 2;
		const marginX = 54;
		const endX = layout.canvasWidth - marginX;
		const transCode = (sessionId ? sessionId.slice(-8) : 'R095UJLG').toUpperCase();

		ctx.save();
		ctx.textBaseline = 'top';

		// Top dash divider of receipt summary
		drawReceiptDivider(ctx, marginX, endX, footerTop, 'dash');

		// Column Header (ITEM & QTY)
		ctx.font = '800 58px "Courier New", Courier, monospace';
		ctx.fillStyle = '#111111';
		ctx.textAlign = 'left';
		ctx.fillText(`ITEM`, marginX + 15, footerTop + 25);
		ctx.textAlign = 'right';
		ctx.fillText(`QTY`, endX - 15, footerTop + 25);

		// Divider
		drawReceiptDivider(ctx, marginX, endX, footerTop + 95, 'solid');

		// Items list (Extra-large 54px monospace)
		ctx.font = '700 54px "Courier New", Courier, monospace';
		let itemY = footerTop + 120;

		// Item 1
		ctx.textAlign = 'left';
		ctx.fillText(`PHOTOSTRIP (3-CUT)`, marginX + 15, itemY);
		ctx.textAlign = 'right';
		ctx.fillText(`1`, endX - 15, itemY);

		itemY += 72;

		// Item 2
		ctx.textAlign = 'left';
		ctx.fillText(`BTS LIVE VIDEO`, marginX + 15, itemY);
		ctx.textAlign = 'right';
		ctx.fillText(`1`, endX - 15, itemY);

		itemY += 72;

		// Divider
		drawReceiptDivider(ctx, marginX, endX, itemY + 12, 'solid');

		// Total line (Giant 72px bold!)
		ctx.font = '800 72px "Courier New", Courier, monospace';
		ctx.textAlign = 'left';
		ctx.fillText(`TOTAL`, marginX + 15, itemY + 34);
		ctx.textAlign = 'right';
		ctx.fillText(`PRICELESS`, endX - 15, itemY + 34);

		// Divider
		drawReceiptDivider(ctx, marginX, endX, itemY + 125, 'dash');

		if (options.isForPrint) {
			// ========================================================
			// PHYSICAL PRINT MODE: Includes Scannable Download QR Code
			// ========================================================
			const qrSectionY = itemY + 145;

			// QR Code Header (Stacked for giant readable text)
			ctx.textAlign = 'center';
			ctx.font = '800 54px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText('SCAN TO DOWNLOAD', centerX, qrSectionY + 10);

			ctx.font = '700 46px "Courier New", Courier, monospace';
			ctx.fillText('PHOTO & VIDEO', centerX, qrSectionY + 75);

			// Draw QR Code centered (300x300)
			const qrSize = 300;
			const qrX = centerX - qrSize / 2;
			const qrY = qrSectionY + 140;

			if (qrCanvas) {
				ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
			} else {
				ctx.save();
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(qrX, qrY, qrSize, qrSize);
				ctx.strokeStyle = '#111111';
				ctx.lineWidth = 4;
				ctx.strokeRect(qrX, qrY, qrSize, qrSize);
				ctx.fillStyle = '#111111';
				ctx.font = 'bold 30px monospace';
				ctx.fillText('CHEKIYUUME QR', centerX, qrY + 145);
				ctx.restore();
			}

			// Order snippet below QR
			const transNoticeY = qrY + qrSize + 22;
			ctx.font = '700 48px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText(`* #TR-${transCode} *`, centerX, transNoticeY);

			// Divider before Barcode
			const barcodeSectionY = transNoticeY + 62;
			drawReceiptDivider(ctx, marginX, endX, barcodeSectionY, 'dash');

			// Barcode Section
			const barcodeY = barcodeSectionY + 28;
			drawBarcode(ctx, centerX, barcodeY, 800, 100, sessionId);

			const barcodeNumY = barcodeY + 118;
			ctx.font = '700 48px "Courier New", Courier, monospace';
			ctx.fillStyle = '#222222';
			ctx.fillText(`4  9 0 1 2 3 4   5 6 7 8 9 0`, centerX, barcodeNumY);

			// Divider
			const footerEndDividerY = barcodeNumY + 62;
			drawReceiptDivider(ctx, marginX, endX, footerEndDividerY, 'solid');

			// Thank You & IG
			ctx.font = '800 60px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText('THANK YOU FOR COMING!', centerX, footerEndDividerY + 30);

			ctx.font = '700 50px "Courier New", Courier, monospace';
			ctx.fillText('@CHEKIYUUME', centerX, footerEndDividerY + 105);
		} else {
			// ========================================================
			// DIGITAL ASSET MODE: Privacy-Safe Barcode (NO QR CODE)
			// ========================================================
			const barcodeSectionY = itemY + 145;

			// Barcode Section
			const barcodeY = barcodeSectionY + 28;
			drawBarcode(ctx, centerX, barcodeY, 800, 100, sessionId);

			const barcodeNumY = barcodeY + 118;
			ctx.textAlign = 'center';
			ctx.font = '700 48px "Courier New", Courier, monospace';
			ctx.fillStyle = '#222222';
			ctx.fillText(`4  9 0 1 2 3 4   5 6 7 8 9 0`, centerX, barcodeNumY);

			// Divider
			const footerEndDividerY = barcodeNumY + 62;
			drawReceiptDivider(ctx, marginX, endX, footerEndDividerY, 'solid');

			// Thank You & IG
			ctx.font = '800 60px "Courier New", Courier, monospace';
			ctx.fillStyle = '#111111';
			ctx.fillText('THANK YOU FOR COMING!', centerX, footerEndDividerY + 30);

			ctx.font = '700 50px "Courier New", Courier, monospace';
			ctx.fillText('@CHEKIYUUME', centerX, footerEndDividerY + 105);
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
