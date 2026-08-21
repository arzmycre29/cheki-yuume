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

	// 2. Map photos to slots
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

	// 6. Draw Footer / Branding Area (only if custom non-default frame and no artwork overlay)
	if (!layout.id.startsWith('default-') && !layout.overlayUrl) {
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
