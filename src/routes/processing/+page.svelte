<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import { settingsStore } from '$lib/stores/settings';
	import { getLayoutById } from '$lib/config/frameLayouts';
	import { renderPhotostripCanvas, exportPhotostrip } from '$lib/utils/canvasRenderer';
	import { compileSequentialVideostrip } from '$lib/utils/videoCompiler';
	import { uploadSessionToCloud } from '$lib/services/cloudStorage';
	import { soundEngine } from '$lib/utils/sounds';
	import { Sparkles, Loader2, Film, Image as ImageIcon, CheckCircle2 } from '@lucide/svelte';

	let session = $derived($sessionStore);
	let settings = $derived($settingsStore);

	let progressPercent = $state(10);
	let statusStage = $state<'rendering-photo' | 'compiling-video' | 'syncing-cloud' | 'done'>('rendering-photo');
	let statusMessage = $state('Merender Photostrip Resolusi Tinggi...');

	onMount(async () => {
		const currentSession = sessionStore.hydrate();
		if (!currentSession.sessionId || currentSession.photos.length === 0) {
			goto('/');
			return;
		}

		try {
			const layout = getLayoutById(session.layoutId);

			// Stage 1: Render High-Res 2D Photostrip
			statusStage = 'rendering-photo';
			statusMessage = 'Merender Photostrip Resolusi Tinggi (300-540 DPI)...';
			progressPercent = 20;

			const canvas = await renderPhotostripCanvas({
				layout,
				photos: session.photos,
				slotPhotoIds: session.assignedSlotPhotoIds,
				guestName: session.guestName,
				sessionId: session.sessionId,
				brandingTitle: settings.kioskTitle || 'CHEKIYUUME',
				brandingSubtitle: settings.kioskSubtitle || 'PHOTOBOOTH STUDIO'
			});

			const { dataUrl, blob } = exportPhotostrip(canvas);
			const photoBlob = await blob;
			sessionStore.setPhotostrip(dataUrl, photoBlob);

			// Stage 2: Compile Sequential Videostrip (WebCodecs MP4)
			statusStage = 'compiling-video';
			statusMessage = 'Mengompilasi Sequential Videostrip bergerak...';
			progressPercent = 40;

			const videoResult = await compileSequentialVideostrip({
				layout,
				photos: session.photos,
				slotPhotoIds: session.assignedSlotPhotoIds,
				guestName: session.guestName,
				sessionId: session.sessionId,
				brandingTitle: settings.kioskTitle || 'CHEKIYUUME',
				brandingSubtitle: settings.kioskSubtitle || 'PHOTOBOOTH STUDIO',
				isMirrored: settings.isMirrored !== false,
				countdownSeconds: settings.countdownSeconds || 5,
				onProgress: (p) => {
					// Scale video compilation progress from 40% to 90%
					progressPercent = 40 + Math.round((p / 100) * 50);
				}
			});

			sessionStore.setVideostrip(videoResult.blob, videoResult.url);

			// Stage 3: Sync to Cloud / Prepare Share Link
			statusStage = 'syncing-cloud';
			statusMessage = 'Menyiapkan QR Code & Galeri Unduhan...';
			progressPercent = 95;

			const uploadRes = await uploadSessionToCloud(session, settings);
			sessionStore.setCloudUploadStatus('success', {
				photo: uploadRes.photoUrl || undefined,
				video: uploadRes.videoUrl || undefined,
				share: uploadRes.shareUrl
			});

			// Finish!
			statusStage = 'done';
			progressPercent = 100;
			statusMessage = 'Selesai!';
			if (settings.enableSound) soundEngine.playCelebration();

			setTimeout(() => {
				goto('/result');
			}, 600);
		} catch (err) {
			console.error('Processing failed:', err);
			statusMessage = 'Terjadi kendala rendering, mengalihkan...';
			setTimeout(() => goto('/result'), 1500);
		}
	});
</script>

<div class="flex h-full w-full flex-col items-center justify-center p-6 text-center">
	<!-- Processing Card -->
	<div class="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl animate-in zoom-in-95 duration-300">
		<div class="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-rose-500 to-indigo-600 shadow-xl shadow-rose-500/20 mb-6">
			<Loader2 class="h-10 w-10 text-white animate-spin" />
			<span class="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-zinc-950 font-bold">
				<Sparkles class="h-3.5 w-3.5" />
			</span>
		</div>

		<h2 class="text-2xl font-black text-white font-display">
			Memproses Hasil Foto
		</h2>
		<p class="mt-2 text-xs text-zinc-400 font-medium">
			{statusMessage}
		</p>

		<!-- Progress Bar -->
		<div class="mt-8 w-full bg-zinc-800 rounded-full h-3.5 overflow-hidden p-0.5 border border-zinc-700/60">
			<div
				class="bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-500 h-full rounded-full transition-all duration-300 shadow-md"
				style="width: {progressPercent}%;"
			></div>
		</div>

		<div class="mt-3 flex items-center justify-between text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
			<span>{statusStage}</span>
			<span class="text-rose-400">{progressPercent}%</span>
		</div>

		<!-- Step Indicators -->
		<div class="mt-8 grid grid-cols-3 gap-2 border-t border-zinc-800/80 pt-6">
			<div class="flex flex-col items-center gap-1.5 {statusStage === 'rendering-photo' ? 'text-rose-400 font-bold' : 'text-zinc-500'}">
				<ImageIcon class="h-4 w-4" />
				<span class="text-[10px]">Photostrip</span>
			</div>
			<div class="flex flex-col items-center gap-1.5 {statusStage === 'compiling-video' ? 'text-rose-400 font-bold' : 'text-zinc-500'}">
				<Film class="h-4 w-4" />
				<span class="text-[10px]">Videostrip</span>
			</div>
			<div class="flex flex-col items-center gap-1.5 {statusStage === 'syncing-cloud' || statusStage === 'done' ? 'text-emerald-400 font-bold' : 'text-zinc-500'}">
				<CheckCircle2 class="h-4 w-4" />
				<span class="text-[10px]">QR & Share</span>
			</div>
		</div>
	</div>
</div>
