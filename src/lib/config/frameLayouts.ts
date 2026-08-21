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
		description: 'Format kartu single polaroid putih polos bersih',
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

	// --- 2 SLOTS (DUO STRIP) ---
	{
		id: 'default-2-white',
		name: 'Classic White (2-Strip)',
		description: 'Format strip 2 foto vertikal putih polos bersih',
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

	// --- 3 SLOTS (TRIO STRIP) ---
	{
		id: 'default-3-white',
		name: 'Classic White (3-Strip)',
		description: 'Format strip 3 foto vertikal putih polos bersih',
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

	// --- 4 SLOTS (CLASSIC 4-CUT) ---
	{
		id: 'default-4-classic',
		name: 'Classic White (4-Cut)',
		description: 'Format strip 4 foto photobooth putih polos bersih',
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
	}
];

export const DEFAULT_SLOT_OPTIONS = [
	{
		slotCount: 1,
		title: '1 Foto (Card)',
		description: 'Format kartu single polaroid 1 foto putih polos',
		aspectRatioLabel: '1:1.03 (Card)',
		canvasWidth: 1080,
		canvasHeight: 1108
	},
	{
		slotCount: 2,
		title: '2 Foto (Duo Strip)',
		description: 'Format strip 2 foto vertikal putih polos',
		aspectRatioLabel: '4:7 (Duo Strip)',
		canvasWidth: 1080,
		canvasHeight: 1890
	},
	{
		slotCount: 3,
		title: '3 Foto (Trio Strip)',
		description: 'Format strip 3 foto vertikal putih polos',
		aspectRatioLabel: '1:2.47 (Trio Strip)',
		canvasWidth: 1080,
		canvasHeight: 2672
	},
	{
		slotCount: 4,
		title: '4 Foto (Classic Strip)',
		description: 'Format strip 4 foto klasik photobooth putih polos',
		aspectRatioLabel: '5:16 (Classic 4-Cut)',
		canvasWidth: 1080,
		canvasHeight: 3456
	}
];

export const CREATIVE_FRAMES = ALL_FRAME_TEMPLATES;

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

	return ALL_FRAME_TEMPLATES[3] || ALL_FRAME_TEMPLATES[0]; // Default to 4-cut classic
}
