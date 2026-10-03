import QRCode from 'qrcode';
import type { FrameLayout, PhotoItem, StickerItem } from '$lib/types';

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = (e) => reject(e);
		img.src = src;
	});
}

async function generateQrDataUrl(text: string): Promise<string> {
	try {
		return await QRCode.toDataURL(text, {
			width: 320,
			margin: 1,
			color: {
				dark: '#000000',
				light: '#ffffff'
			},
			errorCorrectionLevel: 'M'
		});
	} catch (err) {
		console.warn('[QR] Failed to generate QR code for canvas:', err);
		return '';
	}
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

	const canvas = document.createElement('canvas');
	canvas.width = layout.canvasWidth;
	canvas.height = layout.canvasHeight;
	const ctx = canvas.getContext('2d', { alpha: false });

	if (!ctx) {
		throw new Error('Canvas 2D context creation failed');
	}

	const isThematicReceipt = layout.id.startsWith('thematic-receipt');

	let qrImg: HTMLImageElement | null = null;
	if (isThematicReceipt && options.isForPrint) {
		const targetShareUrl = options.shareUrl || (
			sessionId
				? (typeof window !== 'undefined' ? `${window.location.origin}/share/${sessionId}` : `/share/${sessionId}`)
				: ''
		);
		if (targetShareUrl) {
			try {
				const qrDataUrl = await generateQrDataUrl(targetShareUrl);
				if (qrDataUrl) {
					qrImg = await loadImage(qrDataUrl);
				}
			} catch (e) {
				console.warn('Receipt QR generation error:', e);
			}
		}
	}

	// 1. Draw Background
	ctx.fillStyle = layout.backgroundColor || '#FFFFFF';
	ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

	// If there is a background image overlay
	if (layout.backgroundUrl) {
		try {
			const bgImg = await loadImage(layout.backgroundUrl);
			ctx.drawImage(bgImg, 0, 0, layout.canvasWidth, layout.canvasHeight);
		} catch (e) {
			console.warn('Failed to load background template image', e);
		}
	}

	// 2. Receipt Header (for Thematic Receipt layout)
	if (isThematicReceipt) {
		ctx.save();
		ctx.fillStyle = '#111111';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';

		// Store Header
		ctx.font = '900 42px "Outfit", sans-serif';
		ctx.letterSpacing = '3px';
		ctx.fillText(`*** ${(brandingTitle || 'CHEKIYUUME').toUpperCase()} ***`, layout.canvasWidth / 2, 45);

		ctx.font = '700 22px "Plus Jakarta Sans", monospace';
		ctx.letterSpacing = '2px';
		ctx.fillStyle = '#444444';
		ctx.fillText(`${(brandingSubtitle || 'PHOTOBOOTH STUDIO').toUpperCase()}`, layout.canvasWidth / 2, 100);

		// Dashed Divider
		ctx.setLineDash([8, 6]);
		ctx.strokeStyle = '#555555';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(54, 145);
		ctx.lineTo(layout.canvasWidth - 54, 145);
		ctx.stroke();

		// Info Rows (monospaced receipt style)
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
		ctx.fillText(`POS #01`, layout.canvasWidth - 74, 175);
		ctx.fillText(`REG: MEMORY`, layout.canvasWidth - 74, 218);
		ctx.fillText(`3 POSES`, layout.canvasWidth - 74, 260);

		// Dashed Divider before photos
		ctx.setLineDash([8, 6]);
		ctx.strokeStyle = '#555555';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(54, 310);
		ctx.lineTo(layout.canvasWidth - 54, 310);
		ctx.stroke();

		// Header Label
		ctx.setLineDash([]);
		ctx.textAlign = 'center';
		ctx.font = '700 22px "Plus Jakarta Sans", monospace';
		ctx.fillStyle = '#333333';
		ctx.fillText(`- - - PHOTO STRIP MEMORIES - - -`, layout.canvasWidth / 2, 345);

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

		// Create slot clip path (with rounded corners)
		const radius = slot.borderRadius ?? 12;
		drawRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, radius);
		ctx.clip();

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

		// Optional border outline for receipt photo slots
		if (isThematicReceipt) {
			ctx.save();
			ctx.strokeStyle = '#444444';
			ctx.lineWidth = 2.5;
			drawRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, radius);
			ctx.stroke();
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
		const footerTop = layout.canvasHeight - layout.footerHeight;
		const centerX = layout.canvasWidth / 2;

		// Top dashed line of footer
		ctx.setLineDash([8, 6]);
		ctx.strokeStyle = '#555555';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(54, footerTop + 20);
		ctx.lineTo(layout.canvasWidth - 54, footerTop + 20);
		ctx.stroke();

		// Receipt Itemized summary
		ctx.setLineDash([]);
		ctx.textAlign = 'left';
		ctx.font = '600 24px "Plus Jakarta Sans", monospace';
		ctx.fillStyle = '#222222';
		ctx.fillText(`3X PHOTOBOOTH SNAPSHOTS`, 74, footerTop + 65);
		ctx.textAlign = 'right';
		ctx.fillText(`PRICELESS`, layout.canvasWidth - 74, footerTop + 65);

		ctx.textAlign = 'left';
		ctx.font = '500 22px "Plus Jakarta Sans", monospace';
		ctx.fillStyle = '#666666';
		ctx.fillText(`DIGITAL COPY & BTS VIDEO`, 74, footerTop + 105);
		ctx.textAlign = 'right';
		ctx.fillText(`INCLUDED`, layout.canvasWidth - 74, footerTop + 105);

		// Double separator
		ctx.strokeStyle = '#222222';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(54, footerTop + 145);
		ctx.lineTo(layout.canvasWidth - 54, footerTop + 145);
		ctx.stroke();

		// Total Line
		ctx.textAlign = 'left';
		ctx.font = '800 28px "Plus Jakarta Sans", monospace';
		ctx.fillStyle = '#111111';
		ctx.fillText(`TOTAL HAPPINESS`, 74, footerTop + 195);
		ctx.textAlign = 'right';
		ctx.fillText(`100% SUCCESS`, layout.canvasWidth - 74, footerTop + 195);

		// Dashed Divider below Total
		ctx.setLineDash([8, 6]);
		ctx.strokeStyle = '#555555';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(54, footerTop + 235);
		ctx.lineTo(layout.canvasWidth - 54, footerTop + 235);
		ctx.stroke();
		ctx.setLineDash([]);

		if (options.isForPrint && qrImg) {
			// Physical Print Mode: Render Scannable Download QR Code
			ctx.textAlign = 'center';
			ctx.font = '700 20px "Plus Jakarta Sans", monospace';
			ctx.letterSpacing = '1px';
			ctx.fillStyle = '#222222';
			ctx.fillText('SCAN TO DOWNLOAD PHOTO & VIDEO', centerX, footerTop + 265);

			// Draw QR Code centered with sharp high contrast
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

			// Thank You Note
			ctx.font = '800 24px "Outfit", sans-serif';
			ctx.letterSpacing = '2px';
			ctx.fillStyle = '#111111';
			ctx.fillText(`*** THANK YOU FOR VISITING ***`, centerX, footerTop + 620);

			// Social handle
			ctx.font = '600 18px "Plus Jakarta Sans", monospace';
			ctx.letterSpacing = '1px';
			ctx.fillStyle = '#666666';
			ctx.fillText(`SHARE YOUR MOMENTS • TAG US @CHEKIYUUME`, centerX, footerTop + 660);
		} else {
			// Digital Asset Mode: Aesthetic Barcode (Privacy-safe for Social Media)
			drawBarcode(ctx, centerX, footerTop + 275, 620, 100, sessionId);

			ctx.textAlign = 'center';
			ctx.font = '700 22px "Plus Jakarta Sans", monospace';
			ctx.letterSpacing = '1px';
			ctx.fillStyle = '#333333';
			const codeStr = sessionId ? `* ${sessionId.toUpperCase().slice(-14)} *` : '* CHEKIYUUME-RECEIPT *';
			ctx.fillText(codeStr, centerX, footerTop + 400);

			// Dashed Divider below Barcode
			ctx.setLineDash([8, 6]);
			ctx.strokeStyle = '#555555';
			ctx.lineWidth = 2.5;
			ctx.beginPath();
			ctx.moveTo(54, footerTop + 450);
			ctx.lineTo(layout.canvasWidth - 54, footerTop + 450);
			ctx.stroke();
			ctx.setLineDash([]);

			// Thank You Note
			ctx.font = '800 26px "Outfit", sans-serif';
			ctx.letterSpacing = '2px';
			ctx.fillStyle = '#111111';
			ctx.fillText(`*** THANK YOU FOR VISITING ***`, centerX, footerTop + 510);

			// Social handle
			ctx.font = '600 20px "Plus Jakarta Sans", monospace';
			ctx.letterSpacing = '1px';
			ctx.fillStyle = '#666666';
			ctx.fillText(`SHARE YOUR MOMENTS • TAG US @CHEKIYUUME`, centerX, footerTop + 560);
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
