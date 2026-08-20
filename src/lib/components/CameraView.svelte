<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cameraService } from '$lib/services/camera';
	import { soundEngine } from '$lib/utils/sounds';
	import { settingsStore } from '$lib/stores/settings';
	import CountdownOverlay from './CountdownOverlay.svelte';
	import { Camera, FlipHorizontal, RefreshCw } from '@lucide/svelte';

	interface Props {
		onCapture: (photo: { dataUrl: string; blob: Blob }, btsVideo: { blob: Blob; url: string } | null) => void;
		currentPoseIndex: number;
		totalPoses: number;
		autoStartCountdown?: boolean;
		disabled?: boolean;
	}

	let {
		onCapture,
		currentPoseIndex,
		totalPoses,
		autoStartCountdown = false,
		disabled = false
	}: Props = $props();

	let videoElement: HTMLVideoElement | null = $state(null);
	let isCameraReady = $state(false);
	let isFlashing = $state(false);
	let countdownNumber: number | null = $state(null);
	let isCountingDown = $state(false);
	let countdownTimer: NodeJS.Timeout | null = null;

	let isMirrored = $derived($settingsStore.isMirrored);
	let countdownDuration = $derived($settingsStore.countdownSeconds || 5);
	let enableSound = $derived($settingsStore.enableSound);

	onMount(async () => {
		try {
			const stream = await cameraService.startStream(
				$settingsStore.cameraDeviceId,
				$settingsStore.cameraResolution
			);
			if (videoElement) {
				videoElement.srcObject = stream;
				videoElement.onloadedmetadata = () => {
					isCameraReady = true;
					videoElement?.play();
					if (autoStartCountdown) {
						setTimeout(() => startCountdown(), 1000);
					}
				};
			}
		} catch (err) {
			console.error('Camera stream initialization failed:', err);
		}
	});

	onDestroy(() => {
		if (countdownTimer) clearInterval(countdownTimer);
		cameraService.stopStream();
	});

	export function triggerCountdown() {
		if (!isCountingDown && isCameraReady && !disabled) {
			startCountdown();
		}
	}

	function startCountdown() {
		if (isCountingDown) return;
		isCountingDown = true;
		countdownNumber = countdownDuration;

		// Start recording BTS video clip from the stream during countdown
		cameraService.startBtsRecording();

		if (enableSound) soundEngine.playCountdownTick();

		countdownTimer = setInterval(async () => {
			if (countdownNumber !== null && countdownNumber > 1) {
				countdownNumber--;
				if (enableSound) {
					if (countdownNumber <= 2) {
						soundEngine.playFinalCountdownTick();
					} else {
						soundEngine.playCountdownTick();
					}
				}
			} else {
				// Shutter moment!
				if (countdownTimer) clearInterval(countdownTimer);
				countdownNumber = 0; // SMILE!

				if (enableSound) soundEngine.playShutter();

				// Trigger flash animation
				isFlashing = true;

				// Capture photo snapshot
				if (videoElement) {
					try {
						const { dataUrl, blob } = cameraService.capturePhoto(videoElement, isMirrored);
						const photoBlob = await blob;

						// Stop BTS recording
						const btsVideo = await cameraService.stopBtsRecording();

						setTimeout(() => {
							isFlashing = false;
							countdownNumber = null;
							isCountingDown = false;
							onCapture({ dataUrl, blob: photoBlob }, btsVideo);
						}, 300);
					} catch (e) {
						console.error('Capture failed:', e);
						isFlashing = false;
						countdownNumber = null;
						isCountingDown = false;
					}
				}
			}
		}, 1000);
	}

	function toggleMirror() {
		settingsStore.updateSettings({ isMirrored: !isMirrored });
	}
</script>

<div class="relative flex h-full max-h-[80vh] aspect-4/3 w-auto mx-auto flex-col items-center justify-center overflow-hidden rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl">
	<!-- Camera Live Feed (Cropped to exact 4:3 slot framing) -->
	<video
		bind:this={videoElement}
		autoplay
		playsinline
		muted
		class="h-full w-full object-cover transition-transform duration-300 {isMirrored ? '-scale-x-100' : 'scale-x-100'}"
	></video>

	<!-- Live Status Pill & Pose Counter -->
	<div class="absolute top-6 left-6 z-20 flex items-center gap-3">
		<div class="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-md px-4 py-2 border border-zinc-700/50 text-xs font-bold text-white shadow-lg">
			<span class="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
			<span>LIVE VIEW</span>
		</div>
		<div class="rounded-full bg-rose-500/90 backdrop-blur-md px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-rose-500/20">
			Pose {currentPoseIndex + 1} / {totalPoses}
		</div>
	</div>

	<!-- Mirror Toggle & Quick Controls -->
	<div class="absolute top-6 right-6 z-20 flex items-center gap-2">
		<button
			type="button"
			onclick={toggleMirror}
			class="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/60 backdrop-blur-md border border-zinc-700/50 text-zinc-300 hover:text-white hover:bg-black/80 transition-all cursor-pointer"
			title="Cermin Kamera"
		>
			<FlipHorizontal class="h-5 w-5" />
		</button>
	</div>

	<!-- Center Countdown Overlay -->
	<CountdownOverlay count={countdownNumber} label={`Pose ${currentPoseIndex + 1} dari ${totalPoses}`} />

	<!-- Shutter White Flash Overlay -->
	{#if isFlashing}
		<div class="absolute inset-0 z-40 bg-white animate-shutter-flash pointer-events-none"></div>
	{/if}

	<!-- Bottom Capture Trigger Area -->
	<div class="absolute bottom-8 z-20 flex flex-col items-center gap-3">
		<button
			type="button"
			onclick={startCountdown}
			disabled={isCountingDown || !isCameraReady || disabled}
			class="group relative flex h-20 w-20 items-center justify-center rounded-full bg-white p-1 shadow-2xl shadow-rose-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
		>
			<div class="flex h-full w-full items-center justify-center rounded-full bg-rose-500 group-hover:bg-rose-600 transition-colors">
				<Camera class="h-8 w-8 text-white" />
			</div>
			<!-- Outer ring pulse when ready -->
			{#if isCameraReady && !isCountingDown}
				<span class="absolute -inset-2 rounded-full border-2 border-rose-400/60 animate-ping opacity-30 pointer-events-none"></span>
			{/if}
		</button>
		<p class="text-xs font-semibold uppercase tracking-widest text-zinc-300 drop-shadow-md bg-black/40 px-3 py-1 rounded-full backdrop-blur-xs">
			{isCountingDown ? 'Merekam Video & Foto...' : 'Ketuk untuk Jepret Foto'}
		</p>
	</div>
</div>
