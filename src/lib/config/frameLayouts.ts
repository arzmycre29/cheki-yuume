import type { FrameLayout, FrameSlot } from '$lib/types';

export const CANVAS_WIDTH = 1080;
export const SLOT_WIDTH = 972;
export const SLOT_HEIGHT = 729; // 4:3 Aspect Ratio (972 / 729 = 1.333...)
export const MARGIN = 54;

/**
 * Generate standard vertical slots for default layouts
 */
export function createVerticalSlots(count: number): FrameSlot[] {
	const slots: FrameSlot[] = [];
	for (let i = 0; i < count; i++) {
		slots.push({
			index: i,
			x: MARGIN,
			y: MARGIN + i * (SLOT_HEIGHT + MARGIN),
			width: SLOT_WIDTH,
			height: SLOT_HEIGHT,
			borderRadius: 12
		});
	}
	return slots;
}

export function calculateCanvasHeight(slotCount: number): number {
	switch (slotCount) {
		case 1:
			return 1108;
		case 2:
			return 1890;
		case 3:
			return 2672;
		case 4:
		default:
			return 3456;
	}
}

export const ALL_FRAME_TEMPLATES: FrameLayout[] = [
	// --- 1 SLOT (CARD) ---
	{
		id: 'default-1-white',
		name: 'Classic White (1-Card)',
		description: 'Format kartu single polaroid putih bersih dengan branding luas',
		mode: 'default',
		totalSlots: 1,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 1108,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(1),
		backgroundColor: '#FFFFFF',
		footerHeight: 271,
		aspectRatioLabel: '1:1.03 (Card)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-1-midnight',
		name: 'Midnight Matte (1-Card)',
		description: 'Format kartu single hitam elegan modern',
		mode: 'default',
		totalSlots: 1,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 1108,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(1),
		backgroundColor: '#18181B',
		footerHeight: 271,
		aspectRatioLabel: '1:1.03 (Card)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-1-peach',
		name: 'Pastel Peach (1-Card)',
		description: 'Format kartu single polaroid bernuansa peach lembut',
		mode: 'default',
		totalSlots: 1,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 1108,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(1),
		backgroundColor: '#FDF2F0',
		footerHeight: 271,
		aspectRatioLabel: '1:1.03 (Card)',
		recommendedPaper: '4R'
	},

	// --- 2 SLOTS (DUO STRIP) ---
	{
		id: 'default-2-white',
		name: 'Classic White (2-Strip)',
		description: 'Format strip 2 foto vertikal putih bersih ideal untuk cetak 4R',
		mode: 'default',
		totalSlots: 2,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 1890,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(2),
		backgroundColor: '#FFFFFF',
		footerHeight: 270,
		aspectRatioLabel: '4:7 (Duo Strip)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-2-vintage',
		name: 'Vintage Ivory (2-Strip)',
		description: 'Format strip 2 foto bernuansa retro vintage krem hangat',
		mode: 'default',
		totalSlots: 2,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 1890,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(2),
		backgroundColor: '#FAF7F2',
		footerHeight: 270,
		aspectRatioLabel: '4:7 (Duo Strip)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-2-midnight',
		name: 'Midnight Dark (2-Strip)',
		description: 'Format strip 2 foto bernuansa gelap aesthetic',
		mode: 'default',
		totalSlots: 2,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 1890,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(2),
		backgroundColor: '#18181B',
		footerHeight: 270,
		aspectRatioLabel: '4:7 (Duo Strip)',
		recommendedPaper: '4R'
	},

	// --- 3 SLOTS (TRIO STRIP) ---
	{
		id: 'default-3-white',
		name: 'Classic White (3-Strip)',
		description: 'Format strip 3 foto vertikal putih seimbang',
		mode: 'default',
		totalSlots: 3,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 2672,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(3),
		backgroundColor: '#FFFFFF',
		footerHeight: 269,
		aspectRatioLabel: '1:2.47 (Trio Strip)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-3-cloud-blue',
		name: 'Cloud Blue (3-Strip)',
		description: 'Format strip 3 foto bernuansa biru pastel cerah',
		mode: 'default',
		totalSlots: 3,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 2672,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(3),
		backgroundColor: '#F0F7FF',
		footerHeight: 269,
		aspectRatioLabel: '1:2.47 (Trio Strip)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-3-sage',
		name: 'Sage Garden (3-Strip)',
		description: 'Format strip 3 foto bernuansa earth-tone sage green',
		mode: 'default',
		totalSlots: 3,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 2672,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(3),
		backgroundColor: '#EFF6F1',
		footerHeight: 269,
		aspectRatioLabel: '1:2.47 (Trio Strip)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-3-midnight',
		name: 'Midnight Black (3-Strip)',
		description: 'Format strip 3 foto hitam matte elegan',
		mode: 'default',
		totalSlots: 3,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 2672,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(3),
		backgroundColor: '#18181B',
		footerHeight: 269,
		aspectRatioLabel: '1:2.47 (Trio Strip)',
		recommendedPaper: '4R'
	},

	// --- 4 SLOTS (CLASSIC 4-CUT) ---
	{
		id: 'default-4-classic',
		name: 'Classic White (4-Cut)',
		description: 'Format strip 4 foto klasik ala photobooth Korea standar',
		mode: 'default',
		totalSlots: 4,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 3456,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(4),
		backgroundColor: '#FFFFFF',
		footerHeight: 270,
		aspectRatioLabel: '5:16 (Classic 4-Cut)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-4-midnight',
		name: 'Midnight Elegance (4-Cut)',
		description: 'Frame gelap hitam matte dengan aksen perak modern',
		mode: 'default',
		totalSlots: 4,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 3456,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(4),
		backgroundColor: '#18181B',
		footerHeight: 270,
		aspectRatioLabel: '5:16 (Classic 4-Cut)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-4-rosy-pastel',
		name: 'Rosy Peach Pastel (4-Cut)',
		description: 'Frame bernuansa hangat peach pastel lembut & estetis',
		mode: 'default',
		totalSlots: 4,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 3456,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(4),
		backgroundColor: '#FDF2F0',
		footerHeight: 270,
		aspectRatioLabel: '5:16 (Classic 4-Cut)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-4-sage-green',
		name: 'Sage Garden (4-Cut)',
		description: 'Frame bernuansa earth-tone sage green yang segar',
		mode: 'default',
		totalSlots: 4,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 3456,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(4),
		backgroundColor: '#EFF6F1',
		footerHeight: 270,
		aspectRatioLabel: '5:16 (Classic 4-Cut)',
		recommendedPaper: '4R'
	},
	{
		id: 'default-4-lilac',
		name: 'Lilac Dream (4-Cut)',
		description: 'Frame bernuansa ungu pastel lilac aesthetic modern',
		mode: 'default',
		totalSlots: 4,
		canvasWidth: CANVAS_WIDTH,
		canvasHeight: 3456,
		slotWidth: SLOT_WIDTH,
		slotHeight: SLOT_HEIGHT,
		margin: MARGIN,
		slots: createVerticalSlots(4),
		backgroundColor: '#F5F3FF',
		footerHeight: 270,
		aspectRatioLabel: '5:16 (Classic 4-Cut)',
		recommendedPaper: '4R'
	}
];

export const DEFAULT_SLOT_OPTIONS = [
	{
		slotCount: 1,
		title: '1 Foto (Card)',
		description: 'Format kartu single polaroid 1 foto dengan area branding luas',
		aspectRatioLabel: '1:1.03 (Card)',
		canvasWidth: 1080,
		canvasHeight: 1108
	},
	{
		slotCount: 2,
		title: '2 Foto (Duo Strip)',
		description: 'Format strip 2 foto vertikal ideal untuk cetak ganda 4R',
		aspectRatioLabel: '4:7 (Duo Strip)',
		canvasWidth: 1080,
		canvasHeight: 1890
	},
	{
		slotCount: 3,
		title: '3 Foto (Trio Strip)',
		description: 'Format strip 3 foto vertikal modern dan seimbang',
		aspectRatioLabel: '1:2.47 (Trio Strip)',
		canvasWidth: 1080,
		canvasHeight: 2672
	},
	{
		slotCount: 4,
		title: '4 Foto (Classic Strip)',
		description: 'Format strip 4 foto klasik ala photobooth Korea standar',
		aspectRatioLabel: '5:16 (Classic 4-Cut)',
		canvasWidth: 1080,
		canvasHeight: 3456
	}
];

export const CREATIVE_FRAMES = ALL_FRAME_TEMPLATES.filter((f) => f.totalSlots === 4 || f.totalSlots === 3 || f.totalSlots === 2);

export function getFramesBySlotCount(allFrames: FrameLayout[], slotCount: number): FrameLayout[] {
	return allFrames.filter((f) => f.totalSlots === slotCount);
}

export function getLayoutById(id: string, customList?: FrameLayout[]): FrameLayout {
	if (customList && Array.isArray(customList)) {
		const found = customList.find((l) => l.id === id);
		if (found) return found;
	}
	if (typeof window !== 'undefined') {
		try {
			const raw = localStorage.getItem('chekiyuume_custom_frames');
			if (raw) {
				const list: FrameLayout[] = JSON.parse(raw);
				const found = list.find((l) => l.id === id);
				if (found) return found;
			}
		} catch (e) {}
	}
	const builtin = ALL_FRAME_TEMPLATES.find((l) => l.id === id);
	if (builtin) return builtin;

	return ALL_FRAME_TEMPLATES[10]; // Default to 4-cut classic
}
