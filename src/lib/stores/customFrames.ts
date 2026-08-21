import { writable } from 'svelte/store';
import type { FrameLayout, FrameSlot, CaptureMode } from '$lib/types';
import { ALL_FRAME_TEMPLATES, CANVAS_WIDTH, SLOT_WIDTH, SLOT_HEIGHT, MARGIN } from '$lib/config/frameLayouts';

const FRAMES_STORAGE_KEY = 'chekiyuume_custom_frames';

function createVerticalSlots(count: number): FrameSlot[] {
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

function loadInitialFrames(): FrameLayout[] {
	if (typeof window === 'undefined') return ALL_FRAME_TEMPLATES;
	try {
		const raw = localStorage.getItem(FRAMES_STORAGE_KEY);
		if (raw) {
			const custom = JSON.parse(raw);
			if (Array.isArray(custom) && custom.length > 0) {
				// Keep only user-added custom frames and combine with latest ALL_FRAME_TEMPLATES
				const userCustom = custom.filter((f) => f.id.startsWith('custom-'));
				return [...ALL_FRAME_TEMPLATES, ...userCustom];
			}
		}
	} catch (e) {
		console.warn('[Frames] Failed to load custom frames from storage', e);
	}
	return ALL_FRAME_TEMPLATES;
}

function createCustomFramesStore() {
	const { subscribe, set, update } = writable<FrameLayout[]>(loadInitialFrames());

	function persist(frames: FrameLayout[]) {
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem(FRAMES_STORAGE_KEY, JSON.stringify(frames));
			} catch (e) {
				console.warn('[Frames] Failed to save custom frames (quota exceeded?), saving to memory', e);
			}
		}
	}

	return {
		subscribe,
		addFrame: (frameData: {
			name: string;
			description?: string;
			mode: CaptureMode;
			totalSlots: number;
			backgroundColor: string;
			overlayUrl?: string;
			backgroundUrl?: string;
		}) => {
			const id = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
			const canvasHeight = calculateCanvasHeight(frameData.totalSlots);
			const newFrame: FrameLayout = {
				id,
				name: frameData.name.trim() || `Custom Frame (${frameData.totalSlots} Slot)`,
				description: frameData.description?.trim() || `Custom uploaded frame dengan ${frameData.totalSlots} slot`,
				mode: frameData.mode,
				totalSlots: frameData.totalSlots,
				canvasWidth: CANVAS_WIDTH,
				canvasHeight,
				slotWidth: SLOT_WIDTH,
				slotHeight: SLOT_HEIGHT,
				margin: MARGIN,
				slots: createVerticalSlots(frameData.totalSlots),
				backgroundColor: frameData.backgroundColor || '#FFFFFF',
				overlayUrl: frameData.overlayUrl,
				backgroundUrl: frameData.backgroundUrl,
				footerHeight: 270,
				aspectRatioLabel: `${frameData.totalSlots} Slot Strip`,
				recommendedPaper: '4R'
			};

			update((curr) => {
				const next = [newFrame, ...curr];
				persist(next);
				return next;
			});

			return newFrame;
		},
		deleteFrame: (frameId: string) => {
			update((curr) => {
				const next = curr.filter((f) => f.id !== frameId);
				persist(next);
				return next;
			});
		},
		resetToDefault: () => {
			if (typeof window !== 'undefined') {
				localStorage.removeItem(FRAMES_STORAGE_KEY);
			}
			set(ALL_FRAME_TEMPLATES);
		}
	};
}

export const customFramesStore = createCustomFramesStore();
