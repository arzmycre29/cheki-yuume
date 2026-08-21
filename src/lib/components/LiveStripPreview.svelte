<script lang="ts">
	import type { FrameLayout, PhotoItem } from '$lib/types';
	import { CheckCircle2, Image as ImageIcon } from '@lucide/svelte';

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

<div class="flex h-full w-full items-start justify-center min-h-0 min-w-0 overflow-hidden select-none">
	{#if mode === 'default'}
		<!-- Default Mode: 100% WYSIWYG Photostrip Live Preview — width-driven, clips to container height -->
		<div
			class="relative rounded-xs shadow-2xl transition-all duration-300 border border-zinc-700/60 overflow-hidden shrink-0 max-h-full"
			style="background-color: {layout.backgroundColor || '#FFFFFF'}; width: 100%; aspect-ratio: {layout.canvasWidth} / {layout.canvasHeight};"
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
					class="absolute overflow-hidden bg-zinc-800/90 border transition-all duration-300 cursor-pointer {isCurrent ? 'ring-2 ring-rose-500 border-rose-400 scale-[1.01] z-20' : 'border-zinc-700/60 z-10 hover:border-rose-400/80'}"
					style="left: {leftPct}%; top: {topPct}%; width: {widthPct}%; height: {heightPct}%; border-radius: 2px;"
					title={photo ? `Klik untuk Ulangi (Retake) Slot ${idx + 1}` : `Slot ${idx + 1}`}
				>
					{#if photo && photo.dataUrl}
						<img src={photo.dataUrl} alt="Pose {idx + 1}" class="h-full w-full object-cover animate-in fade-in zoom-in duration-300" />
						<div class="absolute bottom-0.5 right-0.5 rounded-full bg-black/70 p-0.5 text-emerald-400 z-20">
							<CheckCircle2 class="h-2.5 w-2.5" />
						</div>
					{:else}
						<div class="flex h-full w-full flex-col items-center justify-center text-zinc-400 p-0.5">
							<ImageIcon class="h-3 w-3 mb-0.5 opacity-50" />
							<span class="text-[7px] font-extrabold uppercase tracking-wider">Slot {idx + 1}</span>
							{#if isCurrent}
								<span class="text-[6px] font-extrabold text-rose-400 animate-pulse mt-0.5">Aktif</span>
							{/if}
						</div>
					{/if}
				</button>
			{/each}

			<!-- Custom Overlay Artwork on top of slots (only if custom frame overlay exists) -->
			{#if layout.overlayUrl}
				<img src={layout.overlayUrl} alt="Overlay" class="absolute inset-0 h-full w-full object-cover pointer-events-none z-30" />
			{/if}
		</div>

	{:else}
		<!-- Creative Mode: 8-Shot Thumbnail Gallery Strip -->
		<div class="flex flex-col h-full w-[160px] sm:w-[200px] lg:w-[240px] rounded-2xl bg-zinc-900/90 border border-zinc-800 p-3 shadow-xl overflow-hidden shrink-0">
			<div class="text-center mb-2 shrink-0">
				<h4 class="text-xs font-extrabold uppercase tracking-wider text-white font-display">
					Koleksi Foto ({photos.length}/8)
				</h4>
			</div>

			<div class="grid grid-cols-2 gap-1.5 flex-1 min-h-0 overflow-y-auto pr-0.5 scrollbar-none">
				{#each Array(8) as _, idx}
					{@const photo = photos.find((p) => p.index === idx) || photos[idx]}
					<button
						type="button"
						onclick={() => onSlotClick && onSlotClick(idx)}
						class="relative aspect-4/3 rounded-lg overflow-hidden bg-zinc-800 border transition-all duration-200 cursor-pointer {idx === currentPoseIndex ? 'ring-2 ring-rose-500 border-rose-400' : 'border-zinc-700/50 hover:border-zinc-500'}"
						title={photo ? `Klik untuk Retake #${idx + 1}` : `Slot #${idx + 1}`}
					>
						{#if photo && photo.dataUrl}
							<img src={photo.dataUrl} alt="Pose {idx + 1}" class="h-full w-full object-cover animate-in fade-in duration-200" />
							<span class="absolute top-0.5 left-0.5 rounded-xs bg-black/70 px-1 py-0.2 text-[8px] font-bold text-white">
								#{idx + 1}
							</span>
						{:else}
							<div class="flex h-full w-full flex-col items-center justify-center text-zinc-500">
								<span class="text-[10px] font-bold">#{idx + 1}</span>
								{#if idx === currentPoseIndex}
									<span class="text-[7px] font-bold text-rose-400 animate-pulse">Next</span>
								{/if}
							</div>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
