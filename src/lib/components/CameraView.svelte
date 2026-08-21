<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { cameraService } from '$lib/services/camera';
	import { uvcCameraService } from '$lib/services/uvcCamera';
	import { soundEngine } from '$lib/utils/sounds';
	import { settingsStore } from '$lib/stores/settings';
	import CountdownOverlay from './CountdownOverlay.svelte';
	import { Camera, FlipHorizontal, RefreshCw, AlertTriangle, Usb, ShieldAlert } from '@lucide/svelte';

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

	// UVC Diagnostic state
	let uvcErrorModal = $state<{
		isOpen: boolean;
		exitCode: string;
		statusCode: number;
		message: string;
		diagnosticInfo: string;
	}>({
		isOpen: false,
		exitCode: '',
		statusCode: 0,
		message: '',
		diagnosticInfo: ''
	});

	let isMirrored = $derived($settingsStore.isMirrored);
	let countdownDuration = $derived($settingsStore.countdownSeconds || 5);
	let enableSound = $derived($settingsStore.enableSound);
	let isUvcMode = $derived($settingsStore.cameraSource === 'uvc' && uvcCameraService.isAvailable());

	onMount(async () => {
		if (isUvcMode) {
			isCameraReady = true;
			if (autoStartCountdown) {
				setTimeout(() => startCountdown(), 1000);
			}
			return;
		}

		try {
			const stream = await cameraService.startStream(
				$settingsStore.cameraDeviceId,
				$settingsStore.cameraResolution
			);
			if (videoElement) {
				videoElement.srcObject = stream;
				try {
					await videoElement.play();
				} catch (playErr) {
					console.warn('Auto-play error on video element:', playErr);
				}
				isCameraReady = true;
				if (autoStartCountdown) {
					setTimeout(() => startCountdown(), 1000);
				}
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

	export function startCountdown() {
		if (isCountingDown || !isCameraReady || disabled) return;
		isCountingDown = true;
		countdownNumber = countdownDuration;

		// Start recording BTS video clip if in standard WebRTC mode
		if (!isUvcMode) {
			cameraService.startBtsRecording();
		}

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

				if (isUvcMode) {
					// 1. Native UVC External Camera Capture Flow
					try {
						const res = await uvcCameraService.capturePhoto(false);
						isFlashing = false;
						countdownNumber = null;
						isCountingDown = false;

						if (res.success && res.dataUrl && res.blob) {
							onCapture({ dataUrl: res.dataUrl, blob: res.blob }, null);
						} else {
							uvcErrorModal = {
								isOpen: true,
								exitCode: res.exitCode,
								statusCode: res.statusCode,
								message: res.message,
								diagnosticInfo: res.diagnosticInfo
							};
						}
					} catch (e: any) {
						console.error('UVC capture exception:', e);
						isFlashing = false;
						countdownNumber = null;
						isCountingDown = false;
						uvcErrorModal = {
							isOpen: true,
							exitCode: 'exception',
							statusCode: -1,
							message: 'Terjadi kegagalan saat mengambil foto dari USB UVC',
							diagnosticInfo: e?.message || String(e)
						};
					}
				} else {
					// 2. Standard WebRTC / Internal Camera Capture Flow
					if (videoElement) {
						try {
							const { dataUrl, blob } = cameraService.capturePhoto(videoElement, isMirrored);

							// Clear flash & countdown immediately (100ms) for instant responsive UI
							setTimeout(() => {
								isFlashing = false;
								countdownNumber = null;
								isCountingDown = false;
							}, 100);

							const photoBlob = await blob;

							// Await BTS live video clip
							const btsVideo = await cameraService.stopBtsRecording();

							onCapture({ dataUrl, blob: photoBlob }, btsVideo);
						} catch (e) {
							console.error('Capture failed:', e);
							isFlashing = false;
							countdownNumber = null;
							isCountingDown = false;
						}
					}
				}
			}
		}, 1000);
	}

	export function isReady() {
		return isCameraReady && !isCountingDown && !disabled;
	}

	export function isBusy() {
		return isCountingDown;
	}

	function toggleMirror() {
		settingsStore.updateSettings({ isMirrored: !isMirrored });
	}

	function switchToInternalCamera() {
		settingsStore.updateSettings({ cameraSource: 'internal' });
		uvcErrorModal.isOpen = false;
		window.location.reload();
	}
</script>

<!-- Clean Studio Viewfinder (4:3 pure aspect ratio with no face obstruction) -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onclick={() => !isCountingDown && isCameraReady && startCountdown()}
	class="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl sm:rounded-3xl bg-zinc-950 border border-zinc-800/80 shadow-2xl shrink-0 cursor-pointer group"
	style="aspect-ratio: 4 / 3; width: auto; height: auto; max-width: 100%; max-height: calc(88vh - 60px);"
>
	{#if isUvcMode}
		<!-- UVC Native Mode Viewfinder Placeholder -->
		<div class="h-full w-full flex flex-col items-center justify-center bg-zinc-900/90 text-center p-6 select-none">
			<div class="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 mb-3 shadow-lg">
				<Usb class="h-8 w-8" />
			</div>
			<h4 class="text-sm sm:text-base font-black text-white font-display">Mode Kamera USB / UVC (Native OTG)</h4>
			<p class="text-[11px] text-zinc-400 max-w-xs mt-1 leading-relaxed">
				Siap mengambil foto beresolusi tinggi langsung dari webcam USB saat hitungan mundur selesai.
			</p>
		</div>
	{:else}
		<!-- Standard Internal WebRTC Camera Live Feed (Cropped to exact 4:3 slot framing) -->
		<video
			bind:this={videoElement}
			autoplay
			playsinline
			muted
			class="h-full w-full object-cover transition-transform duration-300 {isMirrored ? '-scale-x-100' : 'scale-x-100'}"
		></video>
	{/if}

	<!-- Live Status Pill & Pose Counter (Top-Left) -->
	<div class="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex items-center gap-2 pointer-events-none">
		<div class="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-1 text-[10px] sm:text-xs font-bold text-white shadow-lg border border-zinc-700/50">
			<span class="h-2 w-2 rounded-full {isUvcMode ? 'bg-indigo-400' : 'bg-emerald-500'} animate-pulse"></span>
			<span>{isUvcMode ? 'UVC USB' : 'LIVE'}</span>
		</div>
		<div class="rounded-full bg-rose-500/90 backdrop-blur-md px-2.5 py-1 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-rose-500/20">
			Pose {currentPoseIndex + 1}/{totalPoses}
		</div>
	</div>

	<!-- Mirror Toggle & Quick Controls (Top-Right) -->
	{#if !isUvcMode}
		<div class="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex items-center gap-2">
			<button
				type="button"
				onclick={(e) => { e.stopPropagation(); toggleMirror(); }}
				class="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-black/60 backdrop-blur-md border border-zinc-700/50 text-zinc-300 hover:text-white hover:bg-black/80 transition-all active:scale-95 cursor-pointer shadow-lg"
				title="Cermin Kamera"
			>
				<FlipHorizontal class="h-4 w-4" />
			</button>
		</div>
	{/if}

	<!-- Center Countdown Overlay -->
	<CountdownOverlay count={countdownNumber} label={`Pose ${currentPoseIndex + 1} dari ${totalPoses}`} />

	<!-- Shutter White Flash Overlay -->
	{#if isFlashing}
		<div class="absolute inset-0 z-40 bg-white animate-shutter-flash pointer-events-none"></div>
	{/if}

	<!-- Minimalist Studio Framing Crosshairs & Tap Hint -->
	<div class="absolute bottom-2.5 inset-x-0 z-20 flex justify-center pointer-events-none transition-opacity duration-300 {isCountingDown ? 'opacity-0' : 'opacity-80 group-hover:opacity-100'}">
		<span class="text-[10px] font-medium tracking-wide text-zinc-300 drop-shadow-md bg-black/60 px-3 py-0.5 rounded-full backdrop-blur-sm border border-zinc-700/40">
			Sentuh layar kamera atau tombol kanan untuk jepret
		</span>
	</div>
</div>

<!-- UVC Diagnostic Error Modal -->
{#if uvcErrorModal.isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
		<div class="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 p-6 sm:p-8 shadow-2xl text-center flex flex-col items-center">
			<div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 mb-4 shadow-lg">
				<ShieldAlert class="h-8 w-8" />
			</div>

			<h3 class="text-lg sm:text-xl font-black text-white font-display">Diagnostik Kamera USB (UVC)</h3>
			
			<div class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-mono font-bold text-amber-300 border border-zinc-700">
				<span>Exit Code:</span>
				<span class="text-white">{uvcErrorModal.exitCode || 'UNKNOWN'}</span>
				<span>(Code: {uvcErrorModal.statusCode})</span>
			</div>

			<div class="w-full mt-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 p-4 text-left max-h-48 overflow-y-auto">
				<pre class="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
{uvcErrorModal.diagnosticInfo}
				</pre>
			</div>

			<div class="mt-4 flex flex-col sm:flex-row gap-2 w-full">
				<button
					type="button"
					onclick={() => {
						try {
							navigator.clipboard.writeText(`UVC Error [${uvcErrorModal.exitCode}]:\n${uvcErrorModal.diagnosticInfo}`);
							alert('Detail error berhasil disalin!');
						} catch (_) {}
					}}
					class="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2.5 text-xs font-bold text-white shadow-md transition-colors cursor-pointer"
				>
					📋 Salin Detail Error
				</button>
			</div>

			<div class="mt-2 flex flex-col sm:flex-row gap-2.5 w-full">
				<button
					type="button"
					onclick={() => { uvcErrorModal.isOpen = false; }}
					class="w-full sm:w-1/2 rounded-xl bg-zinc-800 hover:bg-zinc-700 py-3 text-xs font-bold text-zinc-300 transition-colors cursor-pointer"
				>
					Tutup
				</button>
				<button
					type="button"
					onclick={switchToInternalCamera}
					class="w-full sm:w-1/2 rounded-xl bg-rose-500 hover:bg-rose-600 py-3 text-xs font-bold text-white shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
				>
					Ganti ke Kamera Internal
				</button>
			</div>
		</div>
	</div>
{/if}
