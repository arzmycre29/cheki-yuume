<script lang="ts">
	import { sessionStore } from '$lib/stores/session';
	import type { FrameLayout, PhotoItem } from '$lib/types';
	import CameraView from '$lib/components/CameraView.svelte';
	import LiveStripPreview from '$lib/components/LiveStripPreview.svelte';
	import { ArrowRight, RotateCcw } from '@lucide/svelte';

	interface Props {
		layout: FrameLayout;
		onFinish8Shots: () => void;
	}

	let { layout, onFinish8Shots }: Props = $props();

	let currentPoseIndex = $state(0);
	const totalPoses = 8;
	let photos = $derived($sessionStore.photos);

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

		if (currentPoseIndex + 1 < totalPoses) {
			currentPoseIndex++;
		}
	}

	function handleSlotClick(idx: number) {
		currentPoseIndex = idx;
	}

	function handleRetakeCurrent() {
		sessionStore.retakeSlot(currentPoseIndex);
	}
</script>

<div class="flex flex-col lg:flex-row items-center justify-center gap-8 xl:gap-12 h-full w-full max-w-7xl mx-auto px-6 py-4 overflow-hidden">
	<!-- Left / Center: Camera Viewfinder -->
	<div class="flex-1 flex flex-col items-center justify-center min-h-0 w-full max-w-3xl">
		<CameraView
			currentPoseIndex={currentPoseIndex}
			totalPoses={totalPoses}
			onCapture={handleCapture}
		/>

		<!-- Quick Retake Controls below camera -->
		<div class="flex items-center gap-3 mt-3">
			{#if photos.some((p) => p.index === currentPoseIndex)}
				<button
					type="button"
					onclick={handleRetakeCurrent}
					class="flex items-center gap-2 rounded-2xl bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white shadow-lg cursor-pointer transition-all hover:scale-105"
				>
					<RotateCcw class="h-3.5 w-3.5 text-indigo-400" />
					<span>Ulangi Pose Ini (Retake #{currentPoseIndex + 1})</span>
				</button>
			{/if}
		</div>
	</div>

	<!-- Right: 8-Shot Thumbnail List & Next Button -->
	<div class="shrink-0 flex flex-col justify-center items-center min-h-0 gap-3 pl-2">
		<LiveStripPreview
			mode="creative"
			layout={layout}
			photos={photos}
			totalPoses={totalPoses}
			currentPoseIndex={currentPoseIndex}
			onSlotClick={handleSlotClick}
		/>

		<!-- Next Button: Can proceed anytime once >= 1 photo is taken! -->
		{#if photos.length >= 1}
			<button
				type="button"
				onclick={onFinish8Shots}
				class="w-full max-w-[240px] flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 py-3 px-4 text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 cursor-pointer animate-in fade-in duration-200"
			>
				<span>Pilih Frame ({photos.length} Foto)</span>
				<ArrowRight class="h-4 w-4" />
			</button>
		{/if}
	</div>
</div>
