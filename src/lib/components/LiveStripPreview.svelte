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

<div class="flex w-full items-center justify-center select-none">
	{#if mode === 'default'}
		<!-- Default Mode: Unified cohesive photostrip preview (Locked aspect-ratio, zero distortion, zero clipping) -->
		<div
			class="relative w-full rounded-xs sm:rounded-sm shadow-xl overflow-hidden shrink-0 transition-all duration-300"
			style="background-color: {layout.backgroundColor || '#FFFFFF'}; aspect-ratio: {layout.canvasWidth} / {layout.canvasHeight};"
		>
			<!-- Custom Background Image if present -->
			{#if layout.backgroundUrl}
				<img src={layout.backgroundUrl} alt="Background" class="absolute inset-0 h-full w-full object-cover pointer-events-none" />
			{/if}

			<!-- Photo Slots — NO individual scale/ring that overflow. Active slot = inset indicator only -->
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
					class="absolute overflow-hidden cursor-pointer transition-all duration-200 z-10"
					style="left: {leftPct}%; top: {topPct}%; width: {widthPct}%; height: {heightPct}%; border-radius: 2px; background: rgba(20,20,20,0.72);"
					title={photo ? `Klik untuk Ulangi (Retake) Slot ${idx + 1}` : `Slot ${idx + 1}`}
				>
					{#if photo && photo.dataUrl}
						<!-- Filled slot — photo -->
						<img src={photo.dataUrl} alt="Pose {idx + 1}" class="h-full w-full object-cover animate-in fade-in zoom-in duration-300" />
						<div class="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-emerald-400 z-10 pointer-events-none">
							<CheckCircle2 class="h-2.5 w-2.5" />
						</div>
					{:else}
						<!-- Empty slot — minimal placeholder, no dark card effect -->
						<div class="flex h-full w-full flex-col items-center justify-center opacity-40 pointer-events-none">
							<ImageIcon class="h-3 w-3 mb-0.5" style="color: {layout.backgroundColor === '#FFFFFF' || !layout.backgroundColor ? '#666' : '#aaa'}" />
							<span class="text-[7px] font-bold uppercase" style="color: {layout.backgroundColor === '#FFFFFF' || !layout.backgroundColor ? '#666' : '#aaa'}">{idx + 1}</span>
						</div>
					{/if}

					<!-- Active slot: inset ring (never overflows the slot boundary) -->
					{#if isCurrent}
						<div class="absolute inset-0 pointer-events-none z-20" style="box-shadow: inset 0 0 0 2px #f43f5e; border-radius: 2px;"></div>
						<div class="absolute top-0.5 left-0.5 rounded-xs bg-rose-500 px-1 py-px z-30 pointer-events-none">
							<span class="text-[5px] font-black text-white uppercase tracking-wide">Aktif</span>
						</div>
					{/if}
				</button>
			{/each}

			<!-- Custom Overlay Artwork on top of slots -->
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
