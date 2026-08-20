<script lang="ts">
	import { sessionStore } from '$lib/stores/session';
	import { customFramesStore } from '$lib/stores/customFrames';
	import type { FrameLayout, PhotoItem } from '$lib/types';
	import { CREATIVE_FRAMES, getLayoutById } from '$lib/config/frameLayouts';
	import { Sparkles, ArrowRight, Wand2, RefreshCw, CheckCircle2, Image as ImageIcon } from '@lucide/svelte';

	interface Props {
		onFinishArrangement: () => void;
	}

	let { onFinishArrangement }: Props = $props();

	let creativeFrames = $derived($customFramesStore.filter((f) => f.totalSlots === 4 || f.totalSlots === 3 || f.totalSlots === 2 || f.totalSlots === 1));
	let photos = $derived($sessionStore.photos);
	let assignedSlotPhotoIds = $derived($sessionStore.assignedSlotPhotoIds);
	let currentLayoutId = $derived($sessionStore.layoutId);

	let selectedFrame = $derived(
		creativeFrames.find((f) => f.id === currentLayoutId) ||
		creativeFrames[0] ||
		CREATIVE_FRAMES[0]
	);

	let selectedPoolPhotoId = $state<string | null>(null);

	// On mount, auto-assign first N photos if slots are not fully populated
	$effect(() => {
		if (assignedSlotPhotoIds.length !== selectedFrame.totalSlots) {
			sessionStore.setLayout(selectedFrame.id, selectedFrame.totalSlots);
		}
	});

	function handleSelectFrame(frame: FrameLayout) {
		sessionStore.setLayout(frame.id, frame.totalSlots);
		selectedPoolPhotoId = null;
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
	}

	function handleSlotClick(slotIndex: number) {
		if (selectedPoolPhotoId) {
			sessionStore.assignSlotPhoto(slotIndex, selectedPoolPhotoId);
			selectedPoolPhotoId = null;
		} else {
			// Clear slot if tapped without photo selected
			sessionStore.assignSlotPhoto(slotIndex, null);
		}
	}

	let isAllSlotsFilled = $derived(
		assignedSlotPhotoIds.length === selectedFrame.totalSlots &&
		assignedSlotPhotoIds.every((id) => id !== null && id !== undefined)
	);
</script>

<div class="flex flex-col h-full w-full max-w-7xl mx-auto p-4 sm:p-6 gap-6 overflow-hidden">
	<!-- Top: Frame Theme Selection Bar -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-zinc-900/90 border border-zinc-800 rounded-3xl p-4 shadow-xl shrink-0 gap-3">
		<div class="flex items-center gap-3">
			<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
				<Sparkles class="h-5 w-5" />
			</div>
			<div>
				<h2 class="text-base sm:text-lg font-extrabold text-white font-display">Editor Frame & Tata Foto</h2>
				<p class="text-xs text-zinc-400">Pilih tema frame di samping, lalu pasang foto terbaikmu ke dalam slot frame</p>
			</div>
		</div>

		<!-- Frame Badges Carousel -->
		<div class="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
			{#each creativeFrames as frame}
				{@const isCurrent = frame.id === selectedFrame.id}
				<button
					type="button"
					onclick={() => handleSelectFrame(frame)}
					class="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer shrink-0 {isCurrent ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20 scale-105' : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700/50'}"
				>
					{#if frame.overlayUrl}
						<span class="h-3.5 w-3.5 rounded-sm bg-cover bg-center border border-white/40" style="background-image: url('{frame.overlayUrl}');"></span>
					{:else}
						<span class="h-3.5 w-3.5 rounded-full border border-white/40" style="background-color: {frame.backgroundColor};"></span>
					{/if}
					<span>{frame.name} ({frame.totalSlots}s)</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Main Body: Split View (Left: Frame Preview with Drop Slots, Right: Photo Pool) -->
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
		<!-- Left (5 cols): Interactive Frame Preview with Exact Coordinate Percentages -->
		<div class="lg:col-span-5 flex flex-col items-center justify-center bg-zinc-900/60 border border-zinc-800 rounded-3xl p-4 shadow-xl overflow-y-auto">
			<div
				class="relative rounded-2xl shadow-2xl transition-all duration-300 border border-zinc-700/50 overflow-hidden"
				style="background-color: {selectedFrame.backgroundColor || '#FFFFFF'}; height: min(65vh, 520px); width: auto; aspect-ratio: {selectedFrame.canvasWidth} / {selectedFrame.canvasHeight}; max-width: 100%;"
			>
				<!-- Custom Background Image if present -->
				{#if selectedFrame.backgroundUrl}
					<img src={selectedFrame.backgroundUrl} alt="Background" class="absolute inset-0 h-full w-full object-cover pointer-events-none" />
				{/if}

				<!-- Photo Slots positioned with exact canvas coordinates -->
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

				<!-- Custom Overlay Artwork on top of slots -->
				{#if selectedFrame.overlayUrl}
					<img src={selectedFrame.overlayUrl} alt="Overlay" class="absolute inset-0 h-full w-full object-cover pointer-events-none z-30" />
				{/if}

				<!-- Default Footer Branding (only if no custom overlay) -->
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
		</div>

		<!-- Right (7 cols): Available Photo Pool & Actions -->
		<div class="lg:col-span-7 flex flex-col justify-between bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl overflow-y-auto gap-4">
			<div>
				<div class="flex items-center justify-between mb-4">
					<div>
						<h3 class="text-base font-extrabold text-white font-display">Koleksi {photos.length} Foto Kamu</h3>
						<p class="text-xs text-zinc-400">
							{#if selectedPoolPhotoId}
								<span class="text-rose-400 font-bold animate-pulse">Foto terpilih! Sekarang ketuk slot di frame kiri untuk memasangnya.</span>
							{:else}
								Ketuk foto di bawah, lalu ketuk slot di frame kiri untuk memasangnya
							{/if}
						</p>
					</div>

					<button
						type="button"
						onclick={handleAutoFill}
						class="flex items-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white border border-zinc-700/50 cursor-pointer transition-colors"
					>
						<Wand2 class="h-3.5 w-3.5 text-indigo-400" />
						<span>Auto Pasang</span>
					</button>
				</div>

				<!-- Grid of Taken Photos (Up to 8) -->
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
			</div>

			<!-- Bottom Navigation -->
			<div class="flex items-center justify-between pt-4 border-t border-zinc-800">
				<div class="text-xs text-zinc-400">
					{#if !isAllSlotsFilled}
						<span class="text-amber-400 font-semibold">⚠️ Lengkapi semua slot foto ({assignedSlotPhotoIds.filter(Boolean).length}/{selectedFrame.totalSlots}) sebelum lanjut</span>
					{:else}
						<span class="text-emerald-400 font-semibold flex items-center gap-1">
							<CheckCircle2 class="h-4 w-4" />
							Semua slot ({selectedFrame.totalSlots} foto) siap dicetak & dikompilasi!
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
