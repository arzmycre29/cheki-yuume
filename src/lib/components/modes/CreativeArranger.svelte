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

<div class="flex flex-col h-full w-full max-w-7xl mx-auto p-4 sm:p-6 gap-5 overflow-hidden select-none">
	<!-- Top: Frame Theme Selection Bar -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-zinc-900/90 border border-zinc-800 rounded-3xl p-4 shadow-xl shrink-0 gap-3">
		<div class="flex items-center gap-3">
			<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-rose-500 text-white shadow-md shrink-0">
				<Sparkles class="h-5 w-5" />
			</div>
			<div>
				<h2 class="text-base sm:text-lg font-extrabold text-white font-display">Editor Frame, Foto & Stiker</h2>
				<p class="text-xs text-zinc-400">Pilih tema frame di samping, tata fotomu, dan hiasi dengan stiker estetik!</p>
			</div>
		</div>

		<!-- Frame Badges Carousel with Active Highlight Indicator -->
		<div class="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
			{#each creativeFrames as frame}
				{@const isCurrent = frame.id === selectedFrame.id}
				<button
					type="button"
					onclick={() => handleSelectFrame(frame)}
					class="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer shrink-0 {isCurrent ? 'bg-gradient-to-r from-indigo-500 via-purple-600 to-rose-500 text-white shadow-lg shadow-rose-500/30 scale-105 ring-2 ring-white/50' : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700/50'}"
				>
					{#if frame.overlayUrl}
						<span class="h-4 w-4 rounded-sm bg-cover bg-center border border-white/60 shadow-xs" style="background-image: url('{frame.overlayUrl}');"></span>
					{:else}
						<span class="h-4 w-4 rounded-full border border-white/60 shadow-xs" style="background-color: {frame.backgroundColor};"></span>
					{/if}
					<span>{frame.name} ({frame.totalSlots}s)</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Main Body: Split View (Left: Interactive Frame Preview with Stickers, Right: Photos/Sticker Toolbox) -->
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
		<!-- Left (5 cols): Interactive Frame Preview with Draggable Stickers -->
		<div class="lg:col-span-5 flex flex-col items-center justify-center bg-zinc-900/60 border border-zinc-800 rounded-3xl p-4 shadow-xl overflow-y-auto relative">
			<!-- Canvas Container -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={canvasElem}
				onpointermove={handleCanvasPointerMove}
				onpointerup={handleCanvasPointerUp}
				onmousedown={handleCanvasMouseDown}
				class="relative rounded-2xl shadow-2xl transition-all duration-300 border border-zinc-700/50 overflow-hidden touch-none"
				style="background-color: {selectedFrame.backgroundColor || '#FFFFFF'}; height: min(65vh, 520px); width: auto; aspect-ratio: {selectedFrame.canvasWidth} / {selectedFrame.canvasHeight}; max-width: 100%;"
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
						class="absolute overflow-hidden bg-zinc-800/90 border-2 transition-all duration-300 cursor-pointer {selectedPoolPhotoId ? 'border-rose-400 animate-pulse hover:border-white ring-2 ring-rose-500/50 z-20' : 'border-zinc-700/60 hover:border-zinc-500 z-10'}"
						style="left: {leftPct}%; top: {topPct}%; width: {widthPct}%; height: {heightPct}%; border-radius: 8px;"
						title={assignedPhoto ? `Klik untuk ganti Slot ${idx + 1}` : `Klik untuk pasang ke Slot ${idx + 1}`}
					>
						{#if assignedPhoto && assignedPhoto.dataUrl}
							<img src={assignedPhoto.dataUrl} alt="Slot {idx + 1}" class="h-full w-full object-cover animate-in fade-in zoom-in-95 duration-200" />
							<span class="absolute top-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white z-20">
								#{idx + 1}
							</span>
						{:else}
							<div class="flex h-full w-full flex-col items-center justify-center text-zinc-500 p-1">
								<ImageIcon class="h-4 w-4 mb-1 opacity-50" />
								<span class="text-[9px] font-extrabold uppercase tracking-wider">Slot {idx + 1}</span>
								{#if selectedPoolPhotoId}
									<span class="text-[8px] font-bold text-rose-400 animate-pulse mt-0.5">Pasang Sini</span>
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
						<span style="font-size: {(st.size || 72) * 0.28}px; line-height: 1;" class="block select-none pointer-events-none">
							{st.emoji}
						</span>

						{#if isSelected}
							<button
								type="button"
								onclick={(e) => { e.stopPropagation(); handleDeleteSticker(st.id); }}
								class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-md hover:bg-rose-600 cursor-pointer"
								title="Hapus Stiker"
							>
								<X class="h-3 w-3" />
							</button>
						{/if}
					</div>
				{/each}

				<!-- Default Footer Branding (only if no overlay) -->
				{#if !selectedFrame.overlayUrl}
					<div class="absolute bottom-0 inset-x-0 w-full text-center pb-2 z-10">
						<div class="text-[10px] font-black tracking-widest uppercase {selectedFrame.backgroundColor === '#18181B' ? 'text-white' : 'text-zinc-900'} font-display">
							CHEKIYUUME
						</div>
						<div class="text-[7px] font-semibold tracking-wider uppercase {selectedFrame.backgroundColor === '#18181B' ? 'text-zinc-400' : 'text-zinc-600'}">
							CREATIVE STUDIO
						</div>
					</div>
				{/if}
			</div>

			<!-- Floating Sticker Transform Controls Toolbar (if sticker selected) -->
			{#if selectedStickerId}
				<div class="mt-3 flex items-center gap-2 bg-zinc-950/90 border border-zinc-700 px-3 py-1.5 rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-150 z-40">
					<span class="text-[10px] font-bold text-zinc-400 mr-1">Atur Stiker:</span>
					<button
						type="button"
						onclick={() => handleResizeSticker(10)}
						class="rounded-lg bg-zinc-800 hover:bg-zinc-700 p-1.5 text-zinc-200 hover:text-white cursor-pointer"
						title="Perbesar Stiker"
					>
						<Plus class="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onclick={() => handleResizeSticker(-10)}
						class="rounded-lg bg-zinc-800 hover:bg-zinc-700 p-1.5 text-zinc-200 hover:text-white cursor-pointer"
						title="Perkecil Stiker"
					>
						<Minus class="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onclick={() => handleRotateSticker(15)}
						class="rounded-lg bg-zinc-800 hover:bg-zinc-700 p-1.5 text-zinc-200 hover:text-white cursor-pointer"
						title="Putar Stiker (15°)"
					>
						<RotateCw class="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onclick={() => handleDeleteSticker(selectedStickerId!)}
						class="rounded-lg bg-red-500/20 hover:bg-red-500/40 p-1.5 text-red-400 cursor-pointer"
						title="Hapus Stiker"
					>
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			{:else}
				<div class="mt-2 text-[10px] text-zinc-400">
					💡 <span>Geser stiker di kanvas untuk memindahkan posisi</span>
				</div>
			{/if}
		</div>

		<!-- Right (7 cols): Photo Pool & Stickers Toolbox -->
		<div class="lg:col-span-7 flex flex-col justify-between bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl overflow-y-auto gap-4">
			<div>
				<!-- Tabs: "Foto Kamu" & "Stiker Estetik" -->
				<div class="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => { activeRightTab = 'photos'; selectedStickerId = null; }}
							class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer {activeRightTab === 'photos' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-800/70 text-zinc-400 hover:text-white'}"
						>
							<ImageIcon class="h-4 w-4" />
							<span>Foto ({photos.length})</span>
						</button>
						<button
							type="button"
							onclick={() => { activeRightTab = 'stickers'; selectedPoolPhotoId = null; }}
							class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer {activeRightTab === 'stickers' ? 'bg-rose-500 text-white shadow-md' : 'bg-zinc-800/70 text-zinc-400 hover:text-white'}"
						>
							<Smile class="h-4 w-4" />
							<span>Stiker Estetik ✨ ({stickers.length})</span>
						</button>
					</div>

					{#if activeRightTab === 'photos'}
						<button
							type="button"
							onclick={handleAutoFill}
							class="flex items-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white border border-zinc-700/50 cursor-pointer transition-colors"
						>
							<Wand2 class="h-3.5 w-3.5 text-indigo-400" />
							<span>Auto Pasang</span>
						</button>
					{:else if stickers.length > 0}
						<button
							type="button"
							onclick={() => sessionStore.clearStickers()}
							class="flex items-center gap-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-400 border border-red-500/30 cursor-pointer transition-colors"
						>
							<Trash2 class="h-3.5 w-3.5" />
							<span>Hapus Semua Stiker</span>
						</button>
					{/if}
				</div>

				{#if activeRightTab === 'photos'}
					<!-- Photo Selection Panel -->
					<div class="text-xs text-zinc-400 mb-3">
						{#if selectedPoolPhotoId}
							<span class="text-rose-400 font-bold animate-pulse">Foto terpilih! Sekarang ketuk slot di frame kiri untuk memasangnya.</span>
						{:else}
							Ketuk foto di bawah, lalu ketuk slot di frame kiri untuk memasang / mengganti foto
						{/if}
					</div>

					<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
						{#each photos as photo, idx}
							{@const isAssigned = assignedSlotPhotoIds.includes(photo.id)}
							{@const isSelected = selectedPoolPhotoId === photo.id}

							<button
								type="button"
								onclick={() => handlePoolPhotoClick(photo.id)}
								class="group relative aspect-4/3 rounded-2xl overflow-hidden bg-zinc-800 border-2 transition-all duration-200 cursor-pointer {isSelected ? 'ring-4 ring-rose-500 border-rose-400 scale-105 z-10' : isAssigned ? 'border-emerald-500/60 opacity-90' : 'border-zinc-700/60 hover:border-zinc-500'}"
							>
								<img src={photo.dataUrl} alt="Foto #{idx + 1}" class="h-full w-full object-cover transition-transform group-hover:scale-105" />

								<span class="absolute top-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
									#{idx + 1}
								</span>

								{#if isAssigned}
									<div class="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9px] font-bold text-white shadow-md">
										<CheckCircle2 class="h-3 w-3" />
										<span>Terpasang</span>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<!-- Sticker Palette Panel -->
					<div class="text-xs text-zinc-400 mb-3">
						Ketuk stiker di bawah untuk menempelkannya ke frame, lalu geser atau atur ukurannya di kanvas kiri:
					</div>

					<div class="grid grid-cols-6 sm:grid-cols-8 gap-2.5 p-2 bg-zinc-950/60 rounded-2xl border border-zinc-800 max-h-56 overflow-y-auto">
						{#each STICKER_PACKS as emoji}
							<button
								type="button"
								onclick={() => handleAddSticker(emoji)}
								class="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-2xl hover:scale-125 transition-transform cursor-pointer shadow-md"
								title="Tambah Stiker {emoji}"
							>
								<span>{emoji}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Bottom Navigation -->
			<div class="flex items-center justify-between pt-4 border-t border-zinc-800">
				<div class="text-xs text-zinc-400">
					{#if !isAllSlotsFilled}
						<span class="text-amber-400 font-semibold">⚠️ Lengkapi semua slot foto ({assignedSlotPhotoIds.filter(Boolean).length}/{selectedFrame.totalSlots}) sebelum lanjut</span>
					{:else}
						<span class="text-emerald-400 font-semibold flex items-center gap-1">
							<CheckCircle2 class="h-4 w-4" />
							Semua slot ({selectedFrame.totalSlots} foto) & stiker ({stickers.length}) siap dikompilasi!
						</span>
					{/if}
				</div>

				<button
					type="button"
					onclick={onFinishArrangement}
					disabled={!isAllSlotsFilled}
					class="flex items-center gap-2 rounded-2xl px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white transition-all cursor-pointer {isAllSlotsFilled ? 'bg-gradient-to-r from-indigo-500 via-purple-600 to-rose-500 hover:opacity-95 shadow-xl shadow-rose-500/20 hover:scale-105' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'}"
				>
					<span>Render & Lihat Hasil</span>
					<ArrowRight class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
</div>
