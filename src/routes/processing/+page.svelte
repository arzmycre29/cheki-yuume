<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { sessionStore } from '$lib/stores/session';
	import { settingsStore } from '$lib/stores/settings';
	import { getLayoutById } from '$lib/config/frameLayouts';
	import { renderPhotostripCanvas, exportPhotostrip } from '$lib/utils/canvasRenderer';
	import { compileSequentialVideostrip } from '$lib/utils/videoCompiler';
	import { uploadSessionToCloud } from '$lib/services/cloudStorage';
	import { soundEngine } from '$lib/utils/sounds';
	import { Sparkles, Loader2, Film, Image as ImageIcon, CheckCircle2 } from '@lucide/svelte';

	let progressPercent = $state(10);
	let statusStage = $state<'rendering-photo' | 'compiling-video' | 'syncing-cloud' | 'done'>('rendering-photo');
	let statusMessage = $state('Merender Photostrip Resolusi Tinggi...');

	onMount(async () => {
		const currentSession = sessionStore.hydrate();
		const settings = get(settingsStore);

		// ── Debug log collector (persisted to sessionStorage for result page) ──
		const debugLogs: string[] = [];
		const ts = () => new Date().toISOString().slice(11, 23);
		const logDebug = (...args: unknown[]) => {
			const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a))).join(' ');
			debugLogs.push(`[${ts()}] ${msg}`);
			console.log('[VideoDebug]', msg);
		};
		const flushDebugLogs = () => {
			try {
				sessionStorage.setItem('chekiyuume_video_debug', JSON.stringify(debugLogs.slice(-80)));
			} catch (_) {}
		};

		logDebug('Processing started');
		logDebug('Session photos:', currentSession.photos.length);
		logDebug('Layout:', currentSession.layoutId);
		logDebug('assignedSlotPhotoIds:', JSON.stringify(currentSession.assignedSlotPhotoIds));
		currentSession.photos.forEach((p, i) => {
			logDebug(`Photo[${i}] id=${p.id} hasBtsUrl=${!!p.btsVideoUrl} dataUrlLen=${p.dataUrl?.length ?? 0}`);
		});

		if (!currentSession.sessionId || currentSession.photos.length === 0) {
			goto('/');
			return;
		}

		try {
			const layout = getLayoutById(currentSession.layoutId);

			// Stage 1: Render High-Res 2D Photostrip (Always succeeds)
			statusStage = 'rendering-photo';
			statusMessage = 'Merender Photostrip Resolusi Tinggi (300-540 DPI)...';
			progressPercent = 25;

			const canvas = await renderPhotostripCanvas({
				layout,
				photos: currentSession.photos,
				slotPhotoIds: currentSession.assignedSlotPhotoIds || [],
				stickers: currentSession.stickers || [],
				guestName: currentSession.guestName,
				sessionId: currentSession.sessionId,
				brandingTitle: settings.kioskTitle || 'CHEKIYUUME',
				brandingSubtitle: settings.kioskSubtitle || 'PHOTOBOOTH STUDIO'
			});

			const { dataUrl, blob } = exportPhotostrip(canvas);
			const photoBlob = await blob;
			sessionStore.setPhotostrip(dataUrl, photoBlob);
			logDebug('Photostrip rendered OK, dataUrl length:', dataUrl.length);

			// Stage 2: Compile Sequential Videostrip (WebCodecs MP4 with graceful fallback)
			try {
				statusStage = 'compiling-video';
				statusMessage = 'Mengompilasi Sequential Videostrip bergerak...';
				progressPercent = 50;

				logDebug('isWebCodecsSupported:', typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined');
				logDebug('Starting video compile, countdownSeconds:', settings.countdownSeconds || 3);

				const videoPromise = compileSequentialVideostrip({
					layout,
					photos: currentSession.photos,
					slotPhotoIds: currentSession.assignedSlotPhotoIds || [],
					stickers: currentSession.stickers || [],
					guestName: currentSession.guestName,
					sessionId: currentSession.sessionId,
					brandingTitle: settings.kioskTitle || 'CHEKIYUUME',
					brandingSubtitle: settings.kioskSubtitle || 'PHOTOBOOTH STUDIO',
					isMirrored: settings.isMirrored !== false,
					countdownSeconds: settings.countdownSeconds || 3,
					onProgress: (p) => {
						progressPercent = 50 + Math.round((p / 100) * 40);
						if (p % 20 === 0) logDebug('Video progress:', p + '%');
					}
				});

				const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 30000));
				const videoResult = await Promise.race([videoPromise, timeoutPromise]);

				if (videoResult && videoResult.blob && videoResult.url) {
					logDebug('Video compile success! blob size:', videoResult.blob.size, 'type:', videoResult.blob.type);
					sessionStore.setVideostrip(videoResult.blob, videoResult.url);
				} else {
					logDebug('Video compilation timed out after 30s, proceeding with photostrip');
				}
			} catch (videoErr) {
				logDebug('ERROR in video compile:', String(videoErr));
				console.warn('Video compilation skipped or timed out, proceeding with photostrip:', videoErr);
			} finally {
				flushDebugLogs();
			}

			// Stage 3: Sync to Cloud / Prepare Share Link
			statusStage = 'syncing-cloud';
			statusMessage = 'Menyiapkan QR Code & Galeri Unduhan...';
			progressPercent = 95;

			try {
				const latestSession = get(sessionStore);
				const uploadRes = await uploadSessionToCloud(latestSession, settings);
				sessionStore.setCloudUploadStatus('success', {
					photo: uploadRes.photoUrl || undefined,
					video: uploadRes.videoUrl || undefined,
					share: uploadRes.shareUrl
				});
			} catch (cloudErr) {
				console.warn('Cloud sync error (offline fallback mode active):', cloudErr);
			}

			// Finish!
			statusStage = 'done';
			progressPercent = 100;
			statusMessage = 'Selesai!';
			if (settings.enableSound) soundEngine.playCelebration();

			setTimeout(() => {
				goto('/result');
			}, 400);
		} catch (err) {
			console.error('Processing error:', err);
			statusMessage = 'Menyiapkan pratinjau hasil...';
			flushDebugLogs();
			setTimeout(() => goto('/result'), 800);
		}
	});
</script>

<div class="flex h-full w-full flex-col items-center justify-center p-3 sm:p-6 text-center select-none overflow-hidden">
	<!-- Processing Card -->
	<div class="w-full max-w-md rounded-2xl sm:rounded-3xl bg-zinc-900 border border-zinc-800 p-4 sm:p-6 lg:p-8 shadow-2xl animate-in zoom-in-95 duration-200 my-auto">
		<div class="relative mx-auto flex h-10 w-10 sm:h-14 sm:w-14 lg:h-18 lg:w-18 items-center justify-center rounded-xl sm:rounded-2xl lg:rounded-3xl bg-gradient-to-tr from-rose-500 to-indigo-600 shadow-xl shadow-rose-500/20 mb-2 sm:mb-4 lg:mb-5">
			<Loader2 class="h-5 w-5 sm:h-7 sm:w-7 lg:h-9 lg:w-9 text-white animate-spin" />
			<span class="absolute -top-1 -right-1 flex h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 items-center justify-center rounded-full bg-amber-400 text-zinc-950 font-bold shadow-xs">
				<Sparkles class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
			</span>
		</div>

		<h2 class="text-base sm:text-xl lg:text-2xl font-black text-white font-display">
			Memproses Hasil Foto
		</h2>
		<p class="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-zinc-400 font-medium line-clamp-1">
			{statusMessage}
		</p>

		<!-- Progress Bar -->
		<div class="mt-3 sm:mt-5 w-full bg-zinc-800 rounded-full h-2.5 sm:h-3.5 overflow-hidden p-0.5 border border-zinc-700/60">
			<div
				class="bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-500 h-full rounded-full transition-all duration-300 shadow-md"
				style="width: {progressPercent}%;"
			></div>
		</div>

		<div class="mt-1.5 sm:mt-2 flex items-center justify-between text-[9px] sm:text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
			<span>{statusStage}</span>
			<span class="text-rose-400">{progressPercent}%</span>
		</div>

		<!-- Step Indicators -->
		<div class="mt-3 sm:mt-5 grid grid-cols-3 gap-1.5 sm:gap-2 border-t border-zinc-800/80 pt-2.5 sm:pt-4">
			<div class="flex flex-col items-center gap-1 {statusStage === 'rendering-photo' ? 'text-rose-400 font-bold' : 'text-zinc-500'}">
				<ImageIcon class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
				<span class="text-[9px] sm:text-[10px]">Photostrip</span>
			</div>
			<div class="flex flex-col items-center gap-1 {statusStage === 'compiling-video' ? 'text-rose-400 font-bold' : 'text-zinc-500'}">
				<Film class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
				<span class="text-[9px] sm:text-[10px]">Videostrip</span>
			</div>
			<div class="flex flex-col items-center gap-1 {statusStage === 'syncing-cloud' || statusStage === 'done' ? 'text-emerald-400 font-bold' : 'text-zinc-500'}">
				<CheckCircle2 class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
				<span class="text-[9px] sm:text-[10px]">QR & Share</span>
			</div>
		</div>
	</div>
</div>
