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

function normalizeName(name: string): string {
	return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
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
			const cleanName = frameData.name.trim() || `Custom Frame (${frameData.totalSlots} Slot)`;
			const normName = normalizeName(cleanName);
			const canvasHeight = calculateCanvasHeight(frameData.totalSlots);

			let savedFrame: FrameLayout;

			update((curr) => {
				const existingIndex = curr.findIndex(
					(f) => f.id.startsWith('custom-') && normalizeName(f.name) === normName
				);

				if (existingIndex !== -1) {
					// Anti-Duplication: Update existing frame in place
					const existing = curr[existingIndex];
					savedFrame = {
						...existing,
						name: cleanName,
						description: frameData.description?.trim() || existing.description,
						mode: frameData.mode,
						totalSlots: frameData.totalSlots,
						canvasHeight,
						slots: createVerticalSlots(frameData.totalSlots),
						backgroundColor: frameData.backgroundColor || existing.backgroundColor,
						overlayUrl: frameData.overlayUrl ?? existing.overlayUrl,
						backgroundUrl: frameData.backgroundUrl ?? existing.backgroundUrl,
						aspectRatioLabel: `${frameData.totalSlots} Slot Strip`
					};
					const next = [...curr];
					next[existingIndex] = savedFrame;
					persist(next);
					return next;
				} else {
					const id = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
					savedFrame = {
						id,
						name: cleanName,
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
					const next = [savedFrame, ...curr];
					persist(next);
					return next;
				}
			});

			return savedFrame!;
		},
		addMultipleFrames: (framesData: Array<{
			name: string;
			description?: string;
			mode: CaptureMode;
			totalSlots: number;
			backgroundColor: string;
			overlayUrl?: string;
			backgroundUrl?: string;
		}>) => {
			const processedFrames: FrameLayout[] = [];

			update((curr) => {
				let next = [...curr];

				for (let i = 0; i < framesData.length; i++) {
					const frameData = framesData[i];
					const cleanName = frameData.name.trim() || `Custom Frame (${frameData.totalSlots} Slot)`;
					const normName = normalizeName(cleanName);
					const canvasHeight = calculateCanvasHeight(frameData.totalSlots);

					const existingIndex = next.findIndex(
						(f) => f.id.startsWith('custom-') && normalizeName(f.name) === normName
					);

					if (existingIndex !== -1) {
						// Anti-Duplication: Update existing frame
						const existing = next[existingIndex];
						const updatedFrame: FrameLayout = {
							...existing,
							name: cleanName,
							description: frameData.description?.trim() || existing.description,
							mode: frameData.mode,
							totalSlots: frameData.totalSlots,
							canvasHeight,
							slots: createVerticalSlots(frameData.totalSlots),
							backgroundColor: frameData.backgroundColor || existing.backgroundColor,
							overlayUrl: frameData.overlayUrl ?? existing.overlayUrl,
							backgroundUrl: frameData.backgroundUrl ?? existing.backgroundUrl,
							aspectRatioLabel: `${frameData.totalSlots} Slot Strip`
						};
						next[existingIndex] = updatedFrame;
						processedFrames.push(updatedFrame);
					} else {
						// Insert new frame
						const id = `custom-${Date.now() + i}-${Math.random().toString(36).substring(2, 6)}`;
						const newFrame: FrameLayout = {
							id,
							name: cleanName,
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
						next = [newFrame, ...next];
						processedFrames.push(newFrame);
					}
				}

				persist(next);
				return next;
			});

			return processedFrames;
		},
		deleteFrame: (frameId: string) => {
			update((curr) => {
				const next = curr.filter((f) => f.id !== frameId);
				persist(next);
				return next;
			});
		},
		syncFromRemote: (remoteFrames: FrameLayout[]): number => {
			const remoteCustom = remoteFrames.filter((f) => f.id.startsWith('custom-'));

			// Anti-Duplication: Deduplicate remote custom frames by normalized name
			const seenNames = new Set<string>();
			const dedupedCustom: FrameLayout[] = [];
			for (const f of remoteCustom) {
				const norm = normalizeName(f.name);
				if (!seenNames.has(norm)) {
					seenNames.add(norm);
					dedupedCustom.push(f);
				}
			}

			update(() => {
				// Keep built-in templates and mirror remote custom frames cleanly
				const next = [...ALL_FRAME_TEMPLATES, ...dedupedCustom];
				persist(next);
				return next;
			});
			return dedupedCustom.length;
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

