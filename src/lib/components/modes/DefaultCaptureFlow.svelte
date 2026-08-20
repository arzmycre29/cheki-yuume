<script lang="ts">
	import { sessionStore } from '$lib/stores/session';
	import type { FrameLayout, PhotoItem } from '$lib/types';
	import CameraView from '$lib/components/CameraView.svelte';
	import LiveStripPreview from '$lib/components/LiveStripPreview.svelte';
	import { ArrowRight, RotateCcw } from '@lucide/svelte';

	interface Props {
		layout: FrameLayout;
		onFinishCapture: () => void;
	}

	let { layout, onFinishCapture }: Props = $props();

	let currentPoseIndex = $state(0);
	let totalPoses = $derived(layout.totalSlots);
	let photos = $derived($sessionStore.photos);

	let isAllPhotosFilled = $derived(photos.length >= totalPoses);

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

		// If there is still an empty slot, advance to next empty slot
		const nextEmpty = findNextEmptySlot(currentPoseIndex);
		if (nextEmpty !== -1) {
			currentPoseIndex = nextEmpty;
		}
	}

	function findNextEmptySlot(fromIndex: number): number {
		for (let i = 0; i < totalPoses; i++) {
			const idx = (fromIndex + 1 + i) % totalPoses;
			const hasPhoto = photos.some((p) => p.index === idx);
			if (!hasPhoto) return idx;
		}
		return -1;
	}

	function handleRetakeSlot(slotIdx: number) {
		currentPoseIndex = slotIdx;
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
					<RotateCcw class="h-3.5 w-3.5 text-rose-400" />
					<span>Ulangi Pose Ini (Retake #{currentPoseIndex + 1})</span>
				</button>
			{/if}

			{#if isAllPhotosFilled}
				<button
					type="button"
					onclick={onFinishCapture}
					class="flex items-center gap-2 rounded-2xl bg-rose-500 hover:bg-rose-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-rose-500/30 cursor-pointer transition-all hover:scale-105 animate-in zoom-in-95 duration-200"
				>
					<span>Selesai & Proses Hasil</span>
					<ArrowRight class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Right: Live Frame Strip Preview with Clean Separation -->
	<div class="shrink-0 flex flex-col justify-center items-center min-h-0 pl-2">
		<LiveStripPreview
			mode="default"
			layout={layout}
			photos={photos}
			totalPoses={totalPoses}
			currentPoseIndex={currentPoseIndex}
			onSlotClick={handleRetakeSlot}
		/>
	</div>
</div>
