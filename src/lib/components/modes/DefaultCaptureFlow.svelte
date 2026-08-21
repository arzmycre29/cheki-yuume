<script lang="ts">
	import { sessionStore } from '$lib/stores/session';
	import type { FrameLayout, PhotoItem } from '$lib/types';
	import CameraView from '$lib/components/CameraView.svelte';
	import LiveStripPreview from '$lib/components/LiveStripPreview.svelte';
	import { Camera, ArrowRight, RotateCcw } from '@lucide/svelte';

	interface Props {
		layout: FrameLayout;
		onFinishCapture: () => void;
	}

	let { layout, onFinishCapture }: Props = $props();

	let cameraViewRef = $state<any>(null);
	let currentPoseIndex = $state(0);
	let totalPoses = $derived(layout?.slots?.length || 4);
	let photos = $derived($sessionStore.photos);

	let isAllPhotosFilled = $derived(
		photos.length >= totalPoses &&
		layout.slots.every((_, idx) => photos.some((p) => p.index === idx))
	);

	function handleCapture(
		photoData: { dataUrl: string; blob: Blob },
		btsVideo: { blob: Blob; url: string } | null
	) {
		const newPhoto: PhotoItem = {
			id: `photo-${Date.now()}-${currentPoseIndex}`,
			index: currentPoseIndex,
			dataUrl: photoData.dataUrl,
			blob: photoData.blob,
			timestamp: Date.now(),
			btsVideoBlob: btsVideo?.blob,
			btsVideoUrl: btsVideo?.url
		};

		sessionStore.addPhoto(newPhoto);

		// Advance to next empty slot or next pose index
		if (currentPoseIndex + 1 < totalPoses) {
			currentPoseIndex++;
		}
	}

	function handleRetakeSlot(slotIndex: number) {
		currentPoseIndex = slotIndex;
	}

	function handleRetakeCurrent() {
		sessionStore.retakeSlot(currentPoseIndex);
	}

	function triggerShutter() {
		if (cameraViewRef?.startCountdown) {
			cameraViewRef.startCountdown();
		}
	}
</script>

<div class="flex flex-row items-center justify-center gap-3 sm:gap-6 lg:gap-8 h-full w-full max-h-screen max-w-7xl mx-auto p-2 sm:p-4 lg:p-6 overflow-hidden select-none">
	<!-- Left / Center: Clean 4:3 Studio Camera Viewfinder + Ergonomic Bottom Controls -->
	<div class="flex-1 flex flex-col items-center justify-center h-full min-h-0 min-w-0 gap-2 sm:gap-3.5">
		<!-- Camera Viewfinder with flexible scaling maintaining 4:3 -->
		<div class="flex-1 min-h-0 flex items-center justify-center w-full min-w-0">
			<CameraView
				bind:this={cameraViewRef}
				currentPoseIndex={currentPoseIndex}
				totalPoses={totalPoses}
				onCapture={handleCapture}
			/>
		</div>

		<!-- Ergonomic Action Bar below Viewfinder -->
		<div class="flex flex-row items-center justify-center gap-2 sm:gap-3 w-full max-w-lg shrink-0 px-2">
			<!-- Big Tactile Shutter Button -->
			<button
				type="button"
				onclick={triggerShutter}
				class="group relative flex-1 flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-rose-500 via-rose-600 to-pink-600 hover:from-rose-600 hover:to-pink-700 py-2.5 sm:py-3.5 px-4 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-xl shadow-rose-500/25 active:scale-95 cursor-pointer transition-all min-h-[44px]"
			>
				<Camera class="h-4 w-4 sm:h-5 sm:w-5 text-white group-hover:scale-110 transition-transform" />
				<span>Jepret Pose #{currentPoseIndex + 1}</span>
			</button>

			<!-- Quick Retake if slot already filled -->
			{#if photos.some((p) => p.index === currentPoseIndex)}
				<button
					type="button"
					onclick={handleRetakeCurrent}
					class="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 py-2.5 sm:py-3.5 px-3.5 text-xs sm:text-sm font-bold text-zinc-300 hover:text-white shadow-sm active:scale-95 cursor-pointer min-h-[44px]"
					title="Ulangi Pose Ini"
				>
					<RotateCcw class="h-4 w-4 text-rose-400" />
					<span class="hidden sm:inline">Ulangi</span>
				</button>
			{/if}

			<!-- Finish Button -->
			{#if isAllPhotosFilled}
				<button
					type="button"
					onclick={onFinishCapture}
					class="flex items-center justify-center gap-1.5 rounded-xl sm:rounded-2xl bg-emerald-500 hover:bg-emerald-600 py-2.5 sm:py-3.5 px-4 sm:px-5 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-500/25 active:scale-95 cursor-pointer animate-in zoom-in-95 duration-200 min-h-[44px]"
				>
					<span>Selesai</span>
					<ArrowRight class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Right: Dedicated Live Frame Strip Showcase (Centered Card, True Aspect Ratio, Zero Clipping) -->
	<div class="flex flex-col items-center justify-center h-full max-h-[min(90vh,680px)] min-h-0 shrink-0 p-2 sm:p-3 lg:p-3.5 bg-zinc-900/90 border border-zinc-800/80 rounded-2xl sm:rounded-3xl shadow-2xl backdrop-blur-md">
		<div class="flex-1 min-h-0 flex items-center justify-center w-full overflow-hidden">
			<LiveStripPreview
				mode="default"
				layout={layout}
				photos={photos}
				totalPoses={totalPoses}
				currentPoseIndex={currentPoseIndex}
				onSlotClick={handleRetakeSlot}
			/>
		</div>

		<!-- Bottom Progress Pill (0 / 4) matching studio aesthetic -->
		<div class="mt-1.5 sm:mt-2 shrink-0 flex items-center justify-center w-full">
			<span class="rounded-lg sm:rounded-xl bg-zinc-800/90 border border-zinc-700/60 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[9px] sm:text-xs font-mono font-bold text-zinc-300">
				<span class="text-rose-400 font-extrabold">{photos.length}</span> / {totalPoses}
			</span>
		</div>
	</div>
</div>

