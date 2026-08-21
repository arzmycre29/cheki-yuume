<script lang="ts">
	import { onMount } from 'svelte';
	import { sessionStore } from '$lib/stores/session';
	import { customFramesStore } from '$lib/stores/customFrames';
	import type { FrameLayout, PhotoItem, StickerItem } from '$lib/types';
	import { ALL_FRAME_TEMPLATES, getLayoutById } from '$lib/config/frameLayouts';
	import {
		Sparkles,
		ArrowRight,
		Wand2,
		RefreshCw,
		CheckCircle2,
		Image as ImageIcon,
		Smile,
		Trash2,
		Plus,
		Minus,
		RotateCw,
		X
	} from '@lucide/svelte';

	interface Props {
		onFinishArrangement: () => void;
	}

	let { onFinishArrangement }: Props = $props();

	let creativeFrames = $derived($customFramesStore);
	let photos = $derived($sessionStore.photos);
	let assignedSlotPhotoIds = $derived($sessionStore.assignedSlotPhotoIds);
	let stickers = $derived($sessionStore.stickers || []);
	let currentLayoutId = $derived($sessionStore.layoutId);

	let selectedFrame = $derived(
		creativeFrames.find((f) => f.id === currentLayoutId) ||
		creativeFrames[0] ||
		ALL_FRAME_TEMPLATES[10]
	);

	let activeRightTab = $state<'photos' | 'stickers'>('photos');
	let selectedPoolPhotoId = $state<string | null>(null);
	let selectedStickerId = $state<string | null>(null);

	// Sticker Packs
	const STICKER_PACKS = [
		'✨', '💖', '🌸', '👑', '🎀', '🧸', '🐱', '🌟',
		'🍀', '🔥', '🎉', '🕶️', '💫', '🍓', '🐰', '🐾',
		'🌈', '🤍', '🦋', '🍒', '🌻', '🍰', '🐶', '⚡'
	];

	onMount(() => {
		// If current session layout is not valid or slots count mismatch, choose best initial frame
		if (!creativeFrames.some((f) => f.id === currentLayoutId)) {
			// Choose a frame matching the number of captured photos if possible
			const matchingFrame = creativeFrames.find((f) => f.totalSlots === photos.length) ||
				creativeFrames.find((f) => f.totalSlots <= photos.length) ||
				creativeFrames[0];
			if (matchingFrame) {
				sessionStore.setLayout(matchingFrame.id, matchingFrame.totalSlots);
			}
		} else if (assignedSlotPhotoIds.length !== selectedFrame.totalSlots) {
			sessionStore.setLayout(selectedFrame.id, selectedFrame.totalSlots);
		}
	});

	function handleSelectFrame(frame: FrameLayout) {
		sessionStore.setLayout(frame.id, frame.totalSlots);
		selectedPoolPhotoId = null;
		selectedStickerId = null;
	}

	function handleAutoFill() {
		for (let i = 0; i < selectedFrame.totalSlots; i++) {
			const photo = photos[i % photos.length];
			if (photo) {
				sessionStore.assignSlotPhoto(i, photo.id);
			}
		}
	}

	function handlePoolPhotoClick(photoId: string) {
		selectedPoolPhotoId = selectedPoolPhotoId === photoId ? null : photoId;
		selectedStickerId = null;
	}

	function handleSlotClick(slotIndex: number) {
		if (selectedPoolPhotoId) {
			sessionStore.assignSlotPhoto(slotIndex, selectedPoolPhotoId);
			selectedPoolPhotoId = null;
		} else {
			// Clear slot if tapped without photo selected
			sessionStore.assignSlotPhoto(slotIndex, null);
		}
		selectedStickerId = null;
	}

	// Sticker interactions
	function handleAddSticker(emoji: string) {
		const newSticker: StickerItem = {
			id: `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
			emoji,
			x: 40 + Math.random() * 20, // 40-60%
			y: 35 + Math.random() * 30, // 35-65%
			size: 72,
			rotation: 0
		};
		sessionStore.addSticker(newSticker);
		selectedStickerId = newSticker.id;
	}

	function handleSelectSticker(e: MouseEvent, stickerId: string) {
		e.stopPropagation();
		selectedStickerId = selectedStickerId === stickerId ? null : stickerId;
		selectedPoolPhotoId = null;
	}

	function handleResizeSticker(delta: number) {
		if (!selectedStickerId) return;
		const st = stickers.find((s) => s.id === selectedStickerId);
		if (!st) return;
		const newSize = Math.max(36, Math.min(160, (st.size || 72) + delta));
		sessionStore.updateSticker(selectedStickerId, { size: newSize });
	}

	function handleRotateSticker(deltaDeg: number) {
		if (!selectedStickerId) return;
		const st = stickers.find((s) => s.id === selectedStickerId);
		if (!st) return;
		const newRot = ((st.rotation || 0) + deltaDeg + 360) % 360;
		sessionStore.updateSticker(selectedStickerId, { rotation: newRot });
	}

	function handleDeleteSticker(stickerId: string) {
		sessionStore.removeSticker(stickerId);
		if (selectedStickerId === stickerId) selectedStickerId = null;
	}

	let isAllSlotsFilled = $derived(
		assignedSlotPhotoIds.length === selectedFrame.totalSlots &&
		assignedSlotPhotoIds.every((id) => id !== null && id !== undefined)
	);

	// Dragging sticker logic on interactive frame canvas
	let isDragging = $state(false);
	let dragStickerId = $state<string | null>(null);
	let canvasElem = $state<HTMLDivElement | null>(null);

	function handleCanvasMouseDown(e: MouseEvent) {
		// Deselect sticker if clicking empty area
		if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).closest('[data-sticker]') === null) {
			selectedStickerId = null;
		}
	}

	function handleStickerPointerDown(e: PointerEvent, stickerId: string) {
		e.stopPropagation();
		selectedStickerId = stickerId;
		dragStickerId = stickerId;
		isDragging = true;
	}

	function handleCanvasPointerMove(e: PointerEvent) {
		if (!isDragging || !dragStickerId || !canvasElem) return;
		const rect = canvasElem.getBoundingClientRect();
		const xPct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
		const yPct = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
		sessionStore.updateSticker(dragStickerId, { x: xPct, y: yPct });
	}

	function handleCanvasPointerUp() {
		isDragging = false;
		dragStickerId = null;
	}
</script>

<div class="flex flex-col h-full w-full max-w-7xl mx-auto p-2 overflow-hidden select-none">
	<!-- Top: Frame Theme Selection Bar (Ultra compact) -->
	<div class="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 rounded-xl px-3 py-1.5 shadow-md shrink-0 gap-2">
		<div class="flex items-center gap-1.5 shrink-0">
			<div class="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-rose-500 text-white shadow-xs">
				<Sparkles class="h-3.5 w-3.5" />
			</div>
			<span class="text-xs font-bold text-white">Editor Frame:</span>
		</div>

		<!-- Frame Badges Carousel -->
		<div class="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full scrollbar-none">
			{#each creativeFrames as frame}
				{@const isCurrent = frame.id === selectedFrame.id}
				<button
					type="button"
					onclick={() => handleSelectFrame(frame)}
					class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer shrink-0 {isCurrent ? 'bg-gradient-to-r from-indigo-500 to-rose-500 text-white shadow-sm' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}"
				>
					{#if frame.overlayUrl}
						<span class="h-3 w-3 rounded-xs bg-cover bg-center border border-white/60" style="background-image: url('{frame.overlayUrl}');"></span>
					{:else}
						<span class="h-3 w-3 rounded-full border border-white/60" style="background-color: {frame.backgroundColor};"></span>
					{/if}
					<span>{frame.name} ({frame.totalSlots}s)</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Main Body: Always Side-by-Side in Landscape -->
	<div class="flex flex-row gap-2.5 flex-1 min-h-0 overflow-hidden pt-1.5">
		<!-- Left: Interactive Frame Preview with Draggable Stickers -->
		<div class="flex-1 flex flex-col items-center justify-center bg-zinc-900/60 border border-zinc-800 rounded-2xl p-2 shadow-xl min-h-0 overflow-hidden relative">
			<!-- Canvas Container -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={canvasElem}
				onpointermove={handleCanvasPointerMove}
				onpointerup={handleCanvasPointerUp}
				onmousedown={handleCanvasMouseDown}
				class="relative rounded-xs shadow-2xl transition-all duration-300 border border-zinc-700/60 overflow-hidden touch-none shrink-0 my-auto"
				style="background-color: {selectedFrame.backgroundColor || '#FFFFFF'}; width: min(100%, calc(min(62vh, 520px) * ({selectedFrame.canvasWidth} / {selectedFrame.canvasHeight}))); aspect-ratio: {selectedFrame.canvasWidth} / {selectedFrame.canvasHeight};"
			>
				<!-- Custom Background Image if present -->
				{#if selectedFrame.backgroundUrl}
					<img src={selectedFrame.backgroundUrl} alt="Background" class="absolute inset-0 h-full w-full object-cover pointer-events-none" />
				{/if}

				<!-- Photo Slots with exact percentage coordinates -->
				{#each selectedFrame.slots as slot, idx}
					{@const assignedId = assignedSlotPhotoIds[idx]}
					{@const assignedPhoto = photos.find((p) => p.id === assignedId)}
					{@const leftPct = (slot.x / selectedFrame.canvasWidth) * 100}
					{@const topPct = (slot.y / selectedFrame.canvasHeight) * 100}
					{@const widthPct = (slot.width / selectedFrame.canvasWidth) * 100}
					{@const heightPct = (slot.height / selectedFrame.canvasHeight) * 100}

					<button
						type="button"
						onclick={() => handleSlotClick(idx)}
						class="absolute overflow-hidden bg-zinc-800/90 border transition-all duration-300 cursor-pointer {selectedPoolPhotoId ? 'border-rose-400 animate-pulse hover:border-white ring-2 ring-rose-500/50 z-20' : 'border-zinc-700/60 hover:border-zinc-500 z-10'}"
						style="left: {leftPct}%; top: {topPct}%; width: {widthPct}%; height: {heightPct}%; border-radius: 2px;"
						title={assignedPhoto ? `Klik untuk ganti Slot ${idx + 1}` : `Klik untuk pasang ke Slot ${idx + 1}`}
					>
						{#if assignedPhoto && assignedPhoto.dataUrl}
							<img src={assignedPhoto.dataUrl} alt="Slot {idx + 1}" class="h-full w-full object-cover animate-in fade-in zoom-in-95 duration-200" />
							<span class="absolute top-1 left-1 rounded-md bg-black/70 px-1 py-0.2 text-[8px] font-bold text-white z-20">
								#{idx + 1}
							</span>
						{:else}
							<div class="flex h-full w-full flex-col items-center justify-center text-zinc-500 p-0.5">
								<ImageIcon class="h-3.5 w-3.5 mb-0.5 opacity-50" />
								<span class="text-[8px] font-extrabold uppercase">Slot {idx + 1}</span>
								{#if selectedPoolPhotoId}
									<span class="text-[7px] font-bold text-rose-400 animate-pulse">Pasang</span>
								{/if}
							</div>
						{/if}
					</button>
				{/each}

				<!-- Custom Overlay Artwork PNG on top of slots -->
				{#if selectedFrame.overlayUrl}
					<img src={selectedFrame.overlayUrl} alt="Overlay" class="absolute inset-0 h-full w-full object-cover pointer-events-none z-20" />
				{/if}

				<!-- Interactive Stickers Layer on top of frame -->
				{#each stickers as st (st.id)}
					{@const isSelected = selectedStickerId === st.id}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						data-sticker
						role="button"
						tabindex="0"
						onpointerdown={(e) => handleStickerPointerDown(e, st.id)}
						onclick={(e) => handleSelectSticker(e, st.id)}
						class="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-30 transition-transform hover:scale-110 {isSelected ? 'ring-2 ring-rose-500 rounded-2xl bg-black/30 p-1' : ''}"
						style="left: {st.x}%; top: {st.y}%; transform: translate(-50%, -50%) rotate({st.rotation || 0}deg);"
					>
						<span style="font-size: {(st.size || 72) * 0.25}px; line-height: 1;" class="block select-none pointer-events-none">
							{st.emoji}
						</span>

						{#if isSelected}
							<button
								type="button"
								onclick={(e) => { e.stopPropagation(); handleDeleteSticker(st.id); }}
								class="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow-md hover:bg-rose-600 cursor-pointer"
								title="Hapus Stiker"
							>
								<X class="h-2.5 w-2.5" />
							</button>
						{/if}
					</div>
				{/each}

				<!-- Default Footer Branding -->
				{#if !selectedFrame.overlayUrl}
					<div class="absolute bottom-0 inset-x-0 w-full text-center pb-1 z-10">
						<div class="text-[8px] font-black tracking-widest uppercase {selectedFrame.backgroundColor === '#18181B' ? 'text-white' : 'text-zinc-900'} font-display">
							CHEKIYUUME
						</div>
					</div>
				{/if}
			</div>

			<!-- Floating Sticker Transform Controls Toolbar -->
			{#if selectedStickerId}
				<div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-zinc-950/90 border border-zinc-700 px-2 py-1 rounded-xl shadow-xl z-40">
					<span class="text-[9px] font-bold text-zinc-400">Stiker:</span>
					<button
						type="button"
						onclick={() => handleResizeSticker(10)}
						class="rounded-lg bg-zinc-800 hover:bg-zinc-700 p-1 text-zinc-200"
					>
						<Plus class="h-3 w-3" />
					</button>
					<button
						type="button"
						onclick={() => handleResizeSticker(-10)}
						class="rounded-lg bg-zinc-800 hover:bg-zinc-700 p-1 text-zinc-200"
					>
						<Minus class="h-3 w-3" />
					</button>
					<button
						type="button"
						onclick={() => handleRotateSticker(15)}
						class="rounded-lg bg-zinc-800 hover:bg-zinc-700 p-1 text-zinc-200"
					>
						<RotateCw class="h-3 w-3" />
					</button>
					<button
						type="button"
						onclick={() => handleDeleteSticker(selectedStickerId!)}
						class="rounded-lg bg-red-500/20 hover:bg-red-500/40 p-1 text-red-400"
					>
						<Trash2 class="h-3 w-3" />
					</button>
				</div>
			{/if}
		</div>

		<!-- Right: Photo Pool & Stickers Toolbox (Docked on Right) -->
		<div class="w-[280px] sm:w-[320px] shrink-0 flex flex-col justify-between bg-zinc-900/60 border border-zinc-800 rounded-2xl p-2.5 shadow-xl min-h-0 overflow-y-auto gap-2">
			<div class="flex-1 min-h-0 flex flex-col">
				<!-- Tabs: "Foto Kamu" & "Stiker Estetik" -->
				<div class="flex items-center justify-between mb-2 border-b border-zinc-800 pb-1.5 shrink-0">
					<div class="flex items-center gap-1">
						<button
							type="button"
							onclick={() => { activeRightTab = 'photos'; selectedStickerId = null; }}
							class="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer {activeRightTab === 'photos' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-zinc-800/70 text-zinc-400 hover:text-white'}"
						>
							<ImageIcon class="h-3 w-3" />
							<span>Foto ({photos.length})</span>
						</button>
						<button
							type="button"
							onclick={() => { activeRightTab = 'stickers'; selectedPoolPhotoId = null; }}
							class="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer {activeRightTab === 'stickers' ? 'bg-rose-500 text-white shadow-xs' : 'bg-zinc-800/70 text-zinc-400 hover:text-white'}"
						>
							<Smile class="h-3 w-3" />
							<span>Stiker ({stickers.length})</span>
						</button>
					</div>

					{#if activeRightTab === 'photos'}
						<button
							type="button"
							onclick={handleAutoFill}
							class="flex items-center gap-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-[10px] font-bold text-zinc-300 hover:text-white cursor-pointer"
						>
							<Wand2 class="h-3 w-3 text-indigo-400" />
							<span>Auto</span>
						</button>
					{/if}
				</div>

				{#if activeRightTab === 'photos'}
					<!-- Photo Selection Panel -->
					<div class="grid grid-cols-4 gap-1.5 flex-1 overflow-y-auto pr-0.5">
						{#each photos as photo, idx}
							{@const isAssigned = assignedSlotPhotoIds.includes(photo.id)}
							{@const isSelected = selectedPoolPhotoId === photo.id}

							<button
								type="button"
								onclick={() => handlePoolPhotoClick(photo.id)}
								class="group relative aspect-4/3 rounded-lg overflow-hidden bg-zinc-800 border transition-all cursor-pointer {isSelected ? 'ring-2 ring-rose-500 border-rose-400 scale-105 z-10' : isAssigned ? 'border-emerald-500/60 opacity-90' : 'border-zinc-700/60 hover:border-zinc-500'}"
							>
								<img src={photo.dataUrl} alt="Foto #{idx + 1}" class="h-full w-full object-cover" />
								<span class="absolute top-0.5 left-0.5 rounded-xs bg-black/70 px-1 py-0.2 text-[8px] font-bold text-white">
									#{idx + 1}
								</span>
								{#if isAssigned}
									<div class="absolute bottom-0.5 right-0.5 rounded-full bg-emerald-500 p-0.5 text-white shadow-xs">
										<CheckCircle2 class="h-2.5 w-2.5" />
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<!-- Sticker Palette Panel -->
					<div class="grid grid-cols-6 gap-1.5 p-1.5 bg-zinc-950/60 rounded-xl border border-zinc-800 flex-1 overflow-y-auto">
						{#each STICKER_PACKS as emoji}
							<button
								type="button"
								onclick={() => handleAddSticker(emoji)}
								class="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-lg hover:scale-110 cursor-pointer"
							>
								<span>{emoji}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Bottom Action Button -->
			<div class="pt-1.5 border-t border-zinc-800 shrink-0">
				<button
					type="button"
					onclick={onFinishArrangement}
					disabled={!isAllSlotsFilled}
					class="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-black uppercase tracking-wider text-white transition-all cursor-pointer {isAllSlotsFilled ? 'bg-gradient-to-r from-indigo-500 to-rose-500 shadow-md active:scale-95' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'}"
				>
					<span>Render ({assignedSlotPhotoIds.filter(Boolean).length}/{selectedFrame.totalSlots})</span>
					<ArrowRight class="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	</div>
</div>
