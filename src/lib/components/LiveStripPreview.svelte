<script lang="ts">
	import type { FrameLayout, PhotoItem } from '$lib/types';
	import { CheckCircle2, Image as ImageIcon, RotateCcw } from '@lucide/svelte';

	interface Props {
		mode: 'default' | 'creative';
		layout: FrameLayout;
		photos: PhotoItem[];
		totalPoses: number;
		currentPoseIndex: number;
		onSlotClick?: (index: number) => void;
	}

	let { mode, layout, photos, totalPoses, currentPoseIndex, onSlotClick }: Props = $props();
</script>

<div class="flex h-full w-full flex-col items-center justify-center p-2 min-h-0 overflow-hidden select-none">
	{#if mode === 'default'}
		<!-- Default Mode: 100% WYSIWYG Photostrip Live Preview with Exact Coordinate Percentages -->
		<div
			class="relative rounded-2xl shadow-2xl transition-all duration-300 border border-zinc-700/50 overflow-hidden"
			style="background-color: {layout.backgroundColor || '#FFFFFF'}; height: min(78vh, 620px); width: auto; aspect-ratio: {layout.canvasWidth} / {layout.canvasHeight}; max-width: 100%;"
		>
			<!-- Custom Background Image if present -->
			{#if layout.backgroundUrl}
				<img src={layout.backgroundUrl} alt="Background" class="absolute inset-0 h-full w-full object-cover pointer-events-none" />
			{/if}

			<!-- Photo Slots rendered with exact canvas percentage coordinates -->
			{#each layout.slots as slot, idx}
				{@const photo = photos.find((p) => p.index === idx) || photos[idx]}
				{@const isCurrent = idx === currentPoseIndex}
				{@const leftPct = (slot.x / layout.canvasWidth) * 100}
				{@const topPct = (slot.y / layout.canvasHeight) * 100}
				{@const widthPct = (slot.width / layout.canvasWidth) * 100}
				{@const heightPct = (slot.height / layout.canvasHeight) * 100}

				<button
					type="button"
					onclick={() => onSlotClick && onSlotClick(idx)}
					class="absolute overflow-hidden bg-zinc-800/90 border-2 transition-all duration-300 cursor-pointer {isCurrent ? 'ring-3 ring-rose-500 border-rose-400 scale-[1.02] z-20' : 'border-zinc-700/60 z-10 hover:border-rose-400/80'}"
					style="left: {leftPct}%; top: {topPct}%; width: {widthPct}%; height: {heightPct}%; border-radius: 8px;"
					title={photo ? `Klik untuk Ulangi (Retake) Slot ${idx + 1}` : `Slot ${idx + 1}`}
				>
					{#if photo && photo.dataUrl}
						<img src={photo.dataUrl} alt="Pose {idx + 1}" class="h-full w-full object-cover animate-in fade-in zoom-in duration-300" />
						<div class="absolute bottom-1 right-1 rounded-full bg-black/70 p-0.5 text-emerald-400 z-20">
							<CheckCircle2 class="h-3 w-3" />
						</div>
					{:else}
						<div class="flex h-full w-full flex-col items-center justify-center text-zinc-400 p-1">
							<ImageIcon class="h-4 w-4 mb-0.5 opacity-50" />
							<span class="text-[9px] font-extrabold uppercase tracking-wider">Slot {idx + 1}</span>
							{#if isCurrent}
								<span class="text-[8px] font-extrabold text-rose-400 animate-pulse mt-0.5">Pose Aktif</span>
							{/if}
						</div>
					{/if}
				</button>
			{/each}

			<!-- Custom Overlay Artwork on top of slots -->
			{#if layout.overlayUrl}
				<img src={layout.overlayUrl} alt="Overlay" class="absolute inset-0 h-full w-full object-cover pointer-events-none z-30" />
			{/if}

			<!-- Default Footer Branding (only if no custom overlay is loaded) -->
			{#if !layout.overlayUrl}
				<div class="absolute bottom-0 inset-x-0 w-full text-center pb-2 z-10">
					<div class="text-[11px] font-black tracking-widest uppercase {layout.backgroundColor === '#18181B' ? 'text-white' : 'text-zinc-900'} font-display">
						CHEKIYUUME
					</div>
					<div class="text-[8px] font-semibold tracking-wider uppercase {layout.backgroundColor === '#18181B' ? 'text-zinc-400' : 'text-zinc-600'}">
						PHOTOBOOTH
					</div>
				</div>
			{/if}
		</div>

		<div class="mt-2 text-center text-[10px] text-zinc-400">
			<span>💡 Klik slot foto untuk mengulang (*Retake*)</span>
		</div>
	{:else}
		<!-- Creative Mode: 8-Shot Thumbnail Gallery Strip -->
		<div class="flex flex-col h-full w-full max-w-[240px] max-h-[78vh] rounded-3xl bg-zinc-900/90 border border-zinc-800 p-4 shadow-xl overflow-hidden">
			<div class="text-center mb-3">
				<h4 class="text-sm font-extrabold uppercase tracking-wider text-white font-display">
					Koleksi Foto
				</h4>
				<p class="text-[11px] text-zinc-400">
					{photos.length} dari 8 foto (Maks. 8)
				</p>
			</div>

			<div class="grid grid-cols-2 gap-2 flex-1 overflow-y-auto pr-1">
				{#each Array(8) as _, idx}
					{@const photo = photos.find((p) => p.index === idx) || photos[idx]}
					<button
						type="button"
						onclick={() => onSlotClick && onSlotClick(idx)}
						class="relative aspect-4/3 rounded-xl overflow-hidden bg-zinc-800 border transition-all duration-200 cursor-pointer {idx === currentPoseIndex ? 'ring-2 ring-rose-500 border-rose-400' : 'border-zinc-700/50 hover:border-zinc-500'}"
						title={photo ? `Klik untuk Retake #${idx + 1}` : `Slot #${idx + 1}`}
					>
						{#if photo && photo.dataUrl}
							<img src={photo.dataUrl} alt="Pose {idx + 1}" class="h-full w-full object-cover animate-in fade-in duration-200" />
							<span class="absolute top-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
								#{idx + 1}
							</span>
						{:else}
							<div class="flex h-full w-full flex-col items-center justify-center text-zinc-500">
								<span class="text-xs font-bold">#{idx + 1}</span>
								{#if idx === currentPoseIndex}
									<span class="text-[8px] font-bold text-rose-400 animate-pulse">Next</span>
								{/if}
							</div>
						{/if}
					</button>
				{/each}
			</div>

			<div class="mt-2 text-center text-[10px] text-zinc-400">
				<span>💡 Klik thumbnail untuk Retake pose</span>
			</div>
		</div>
	{/if}
</div>
