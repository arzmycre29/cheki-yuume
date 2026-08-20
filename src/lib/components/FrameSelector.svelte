<script lang="ts">
	import type { FrameLayout } from '$lib/types';
	import { customFramesStore } from '$lib/stores/customFrames';
	import { Check } from '@lucide/svelte';

	interface Props {
		mode: 'default' | 'creative';
		selectedLayoutId: string;
		onSelect: (layout: FrameLayout) => void;
	}

	let { mode, selectedLayoutId, onSelect }: Props = $props();

	// Load dynamic layouts from store
	let allFrames = $derived($customFramesStore);
	let layouts = $derived(
		mode === 'default'
			? allFrames
			: allFrames.filter((f) => f.totalSlots === 4 || f.totalSlots === 3 || f.totalSlots === 2 || f.totalSlots === 1)
	);
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full">
	{#each layouts as layout}
		{@const isSelected = layout.id === selectedLayoutId}
		<button
			type="button"
			onclick={() => onSelect(layout)}
			class="group relative flex flex-col items-center justify-between rounded-3xl p-5 border text-left transition-all duration-300 cursor-pointer {isSelected ? 'bg-zinc-800/90 border-rose-500 ring-2 ring-rose-500/50 shadow-xl shadow-rose-500/10' : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700'}"
		>
			<!-- Selection Badge -->
			{#if isSelected}
				<div class="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white shadow-md z-20">
					<Check class="h-4 w-4 stroke-[3]" />
				</div>
			{/if}

			<!-- Mini Frame Thumbnail Preview (Exact Artwork & Cutout Overlay) -->
			<div class="my-3 flex items-center justify-center h-44 w-full overflow-hidden">
				<div
					class="relative rounded-2xl shadow-lg border border-zinc-700/40 overflow-hidden transition-transform group-hover:scale-105"
					style="background-color: {layout.backgroundColor || '#FFFFFF'}; height: 150px; width: auto; aspect-ratio: {layout.canvasWidth} / {layout.canvasHeight};"
				>
					<!-- Custom Background if present -->
					{#if layout.backgroundUrl}
						<img src={layout.backgroundUrl} alt="Background" class="absolute inset-0 h-full w-full object-cover pointer-events-none" />
					{/if}

					<!-- Slots with exact canvas percentages -->
					{#each layout.slots as slot}
						<div
							class="absolute rounded-xs bg-zinc-700/50 border border-zinc-600/40 shadow-inner"
							style="left: {(slot.x / layout.canvasWidth) * 100}%; top: {(slot.y / layout.canvasHeight) * 100}%; width: {(slot.width / layout.canvasWidth) * 100}%; height: {(slot.height / layout.canvasHeight) * 100}%;"
						></div>
					{/each}

					<!-- Real Custom Overlay Artwork PNG if custom frame -->
					{#if layout.overlayUrl}
						<img src={layout.overlayUrl} alt="Overlay" class="absolute inset-0 h-full w-full object-contain pointer-events-none z-10" />
					{/if}

					<!-- Default Branding (only if no custom overlay) -->
					{#if !layout.overlayUrl}
						<div class="absolute bottom-1 inset-x-0 w-full text-center z-10">
							<div class="text-[5px] font-black tracking-wider uppercase {layout.backgroundColor === '#18181B' ? 'text-white' : 'text-zinc-900'}">
								CHEKIYUUME
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Card Info -->
			<div class="w-full mt-2 text-center">
				<div class="inline-block rounded-full bg-zinc-800 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-400 border border-zinc-700/50 mb-2">
					{layout.totalSlots} Slot Foto • {layout.aspectRatioLabel || '2x6'}
				</div>
				<h3 class="text-lg font-bold text-white font-display">
					{layout.name}
				</h3>
				<p class="text-xs text-zinc-400 mt-1 line-clamp-2">
					{layout.description}
				</p>
			</div>
		</button>
	{/each}
</div>
