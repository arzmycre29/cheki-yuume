<script lang="ts">
	import type { FrameLayout, PhotoItem } from '$lib/types';
	import { CheckCircle2, Image as ImageIcon } from '@lucide/svelte';
	import { cameraService } from '$lib/services/camera';
	import { settingsStore } from '$lib/stores/settings';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		mode: 'default' | 'creative';
		layout: FrameLayout;
		photos: PhotoItem[];
		totalPoses: number;
		currentPoseIndex: number;
		onSlotClick?: (index: number) => void;
	}

	let { mode, layout, photos, totalPoses, currentPoseIndex, onSlotClick }: Props = $props();

	let containerRef = $state<HTMLDivElement | null>(null);
	let isMirrored = $derived($settingsStore.isMirrored);
	let activeVideoEl = $state<HTMLVideoElement | null>(null);
	let liveStream = $state<MediaStream | null>(null);
	let streamCheckTimer: any = null;

	let previewWidth = $state(160);
	let previewHeight = $state(480);

	function recalculateDimensions() {
		if (!containerRef) return;
		const cW = containerRef.clientWidth - 16;
		const cH = containerRef.clientHeight - 56; // subtract padding & counter pill
		if (cW <= 0 || cH <= 0) return;

		const sourceWidth = layout?.canvasWidth || 1080;
		const sourceHeight = layout?.canvasHeight || 3456;
		const sourceAspect = sourceWidth / sourceHeight;
		const containerAspect = cW / cH;

		let w: number;
		let h: number;
		if (sourceAspect > containerAspect) {
			w = cW;
			h = cW / sourceAspect;
		} else {
			h = cH;
			w = cH * sourceAspect;
		}

		previewWidth = Math.max(40, Math.round(w));
		previewHeight = Math.max(120, Math.round(h));
	}

	onMount(() => {
		const syncStream = () => {
			const s = cameraService.getStream();
			if (s && s.active) {
				if (liveStream !== s) {
					liveStream = s;
				}
				if (activeVideoEl && activeVideoEl.srcObject !== s) {
					activeVideoEl.srcObject = s;
					activeVideoEl.play().catch(() => {});
				}
			}
		};

		syncStream();
		streamCheckTimer = setInterval(syncStream, 600);

		recalculateDimensions();
		const resizeObserver = new ResizeObserver(() => {
			recalculateDimensions();
		});
		if (containerRef) resizeObserver.observe(containerRef);

		return () => {
			if (streamCheckTimer) clearInterval(streamCheckTimer);
			resizeObserver.disconnect();
		};
	});

	$effect(() => {
		if (layout) {
			recalculateDimensions();
		}
	});

	$effect(() => {
		if (activeVideoEl && liveStream && activeVideoEl.srcObject !== liveStream) {
			activeVideoEl.srcObject = liveStream;
			activeVideoEl.play().catch(() => {});
		}
	});
</script>

<div
	bind:this={containerRef}
	class="flex flex-col h-full w-full p-2 sm:p-3 lg:p-3.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl sm:rounded-3xl shadow-2xl backdrop-blur-md select-none overflow-hidden"
>
	<!-- Adaptive Center Canvas Area -->
	<div class="flex-1 flex items-center justify-center min-h-0 min-w-0 w-full overflow-hidden">
		{#if mode === 'default'}
			<!-- Photostrip Sized Perfectly via Dynamic Scale Math -->
			<div
				class="relative rounded-md sm:rounded-lg shadow-xl overflow-hidden shrink-0 transition-all duration-200 border border-zinc-800/40"
				style="width: {previewWidth}px; height: {previewHeight}px; background-color: {layout?.backgroundColor || '#FFFFFF'};"
			>
				<!-- Custom Background Image if present -->
				{#if layout?.backgroundUrl}
					<img src={layout.backgroundUrl} alt="Background" class="absolute inset-0 h-full w-full object-cover pointer-events-none" />
				{/if}

				<!-- Photo Slots -->
				{#each layout?.slots || [] as slot, idx}
					{@const photo = photos.find((p) => p.index === idx) || photos[idx]}
					{@const isCurrent = idx === currentPoseIndex}
					{@const leftPct = (slot.x / (layout.canvasWidth || 1080)) * 100}
					{@const topPct = (slot.y / (layout.canvasHeight || 3456)) * 100}
					{@const widthPct = (slot.width / (layout.canvasWidth || 1080)) * 100}
					{@const heightPct = (slot.height / (layout.canvasHeight || 3456)) * 100}

					<button
						type="button"
						onclick={() => onSlotClick && onSlotClick(idx)}
						class="absolute overflow-hidden cursor-pointer transition-all duration-200 z-10"
						style="left: {leftPct}%; top: {topPct}%; width: {widthPct}%; height: {heightPct}%; border-radius: 2px; background: rgba(28,28,32,0.85);"
						title={photo ? `Klik untuk Ulangi (Retake) Slot ${idx + 1}` : `Slot ${idx + 1}`}
					>
						{#if photo && photo.dataUrl}
							<!-- Filled slot — snapshot -->
							<img src={photo.dataUrl} alt="Pose {idx + 1}" class="h-full w-full object-cover animate-in fade-in zoom-in duration-300" />
							<div class="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-emerald-400 z-10 pointer-events-none">
								<CheckCircle2 class="h-2.5 w-2.5" />
							</div>
						{:else if isCurrent && liveStream}
							<!-- Active slot — Live Mirror Camera Feed (ChekiYuu Spec) -->
							<video
								bind:this={activeVideoEl}
								autoplay
								playsinline
								muted
								class="h-full w-full object-cover pointer-events-none {isMirrored ? '-scale-x-100' : ''}"
							></video>
						{:else}
							<!-- Empty slot -->
							<div class="flex h-full w-full flex-col items-center justify-center opacity-30 pointer-events-none">
								<ImageIcon class="h-2.5 w-2.5 sm:h-3 sm:w-3 mb-0.5 text-zinc-400" />
								<span class="text-[6px] sm:text-[7px] font-bold text-zinc-400 uppercase">{idx + 1}</span>
							</div>
						{/if}

						<!-- Active slot: inset ring & AKTIF badge -->
						{#if isCurrent}
							<div class="absolute inset-0 pointer-events-none z-20" style="box-shadow: inset 0 0 0 2px #f43f5e; border-radius: 2px;"></div>
							<div class="absolute top-0.5 left-0.5 rounded-xs bg-rose-500 px-1 py-px z-30 pointer-events-none">
								<span class="text-[5px] sm:text-[6px] font-black text-white uppercase tracking-wider">AKTIF</span>
							</div>
						{/if}
					</button>
				{/each}

				<!-- Custom Overlay Artwork on top of slots -->
				{#if layout?.overlayUrl}
					<img src={layout.overlayUrl} alt="Overlay" class="absolute inset-0 h-full w-full object-cover pointer-events-none z-30" />
				{/if}
			</div>
		{:else}
			<!-- Creative Mode Gallery -->
			<div class="flex flex-col h-full w-full overflow-hidden">
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

	<!-- Bottom Progress Pill (0 / 4) matching ChekiYuu reference -->
	<div class="mt-2 shrink-0 flex items-center justify-center w-full">
		<span class="rounded-full bg-zinc-950/80 border border-zinc-800/80 px-3 py-0.5 sm:py-1 text-[9px] sm:text-[11px] font-mono font-bold text-zinc-400 shadow-inner">
			<span class="text-rose-400 font-extrabold">{photos.length}</span> / {totalPoses}
		</span>
	</div>
</div>
