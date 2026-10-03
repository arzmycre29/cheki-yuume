<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getSessionFromDB } from '$lib/services/db';
	import { generateQrCodeDataUrl } from '$lib/services/cloudStorage';
	import type { SessionData } from '$lib/types';
	import {
		Download,
		Film,
		Image as ImageIcon,
		Sparkles,
		Clock,
		CheckCircle2,
		Loader2,
		QrCode,
		FolderDown,
		Check,
		RotateCcw,
		AlertCircle
	} from '@lucide/svelte';

	let sessionId = $derived(page.params.sessionId);
	let queryPhoto = $derived(page.url.searchParams.get('p') || page.url.searchParams.get('photo'));
	let queryVideo = $derived(page.url.searchParams.get('v') || page.url.searchParams.get('video'));
	let queryName = $derived(page.url.searchParams.get('n') || page.url.searchParams.get('name'));

	let session = $state<SessionData | null>(null);
	let cloudPhotoUrl = $state<string | null>(null);
	let cloudVideoUrl = $state<string | null>(null);
	let cloudGuestName = $state<string | null>(null);
	let syncStatus = $state<'idle' | 'checking' | 'retrying' | 'found' | 'not-found'>('idle');
	let syncAttempt = $state(0);

	let isLoading = $state(true);
	let isDownloadingPhoto = $state(false);
	let isDownloadingVideo = $state(false);
	let isDownloadingQr = $state(false);
	let isDownloadingAll = $state(false);
	let downloadAllProgress = $state('');
	let qrCodeDataUrl = $state<string | null>(null);

	let effectivePhotoUrl = $derived(queryPhoto || session?.cloudPhotoUrl || session?.photostripDataUrl || cloudPhotoUrl);
	let effectiveVideoUrl = $derived(queryVideo || session?.cloudVideoUrl || session?.videostripUrl || cloudVideoUrl);
	let effectiveGuestName = $derived(queryName || session?.guestName || cloudGuestName || 'Tamu Istimewa');
	let hasMedia = $derived(Boolean(effectivePhotoUrl || effectiveVideoUrl));

	async function fetchCloudSessionData(sId: string, maxRetries = 3): Promise<boolean> {
		syncStatus = 'checking';

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			syncAttempt = attempt;
			try {
				console.log(`[Share] Attempt ${attempt}/${maxRetries}: Checking cloud manifest for session "${sId}"...`);

				// 1. Safe query to /api/manifest?type=sessions&id=... (Server filters ONLY this session)
				try {
					const res = await fetch(`/api/manifest?type=sessions&id=${encodeURIComponent(sId)}&_t=${Date.now()}`, {
						cache: 'no-store',
						headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' }
					});
					if (res.ok) {
						const data = await res.json();
						const found = data?.session;
						if (found && (found.photoUrl || found.videoUrl)) {
							cloudPhotoUrl = found.photoUrl || null;
							cloudVideoUrl = found.videoUrl || null;
							cloudGuestName = found.guestName || null;
							syncStatus = 'found';
							console.log('[Share] ✓ Session media found in /api/manifest:', found);
							return true;
						}
					}
				} catch (apiErr) {
					console.warn('[Share] /api/manifest fetch warning:', apiErr);
				}

				// 2. Direct per-session candidate lookup on Cloudinary (no global list leakage)
				let cloudName = 'qhdvucyw';
				try {
					const cfgRes = await fetch('/api/config');
					if (cfgRes.ok) {
						const cfg = await cfgRes.json();
						if (cfg?.cloudinaryCloudName) cloudName = cfg.cloudinaryCloudName;
					}
				} catch (_) {}

				const candidateUrls = [
					`https://res.cloudinary.com/${cloudName}/raw/upload/chekiyuume/sessions/${encodeURIComponent(sId)}/manifest.json?_t=${Date.now()}`
				];

				for (const cUrl of candidateUrls) {
					try {
						const cRes = await fetch(cUrl, { cache: 'no-store' });
						if (cRes.ok) {
							const cJson = await cRes.json();
							if (cJson && (cJson.sessionId === sId || !cJson.sessionId) && (cJson.photoUrl || cJson.videoUrl)) {
								cloudPhotoUrl = cJson.photoUrl || null;
								cloudVideoUrl = cJson.videoUrl || null;
								cloudGuestName = cJson.guestName || null;
								syncStatus = 'found';
								console.log('[Share] ✓ Per-session manifest found:', cJson);
								return true;
							}
						}
					} catch (_) {}
				}

			} catch (err) {
				console.warn(`[Share] Attempt ${attempt} failed:`, err);
			}

			if (attempt < maxRetries) {
				syncStatus = 'retrying';
				const delay = attempt === 1 ? 2500 : 3500;
				await new Promise((r) => setTimeout(r, delay));
			}
		}

		syncStatus = 'not-found';
		return false;
	}

	onMount(async () => {
		if (sessionId) {
			try {
				session = await getSessionFromDB(sessionId);
			} catch (e) {
				console.warn('[Share] No local IndexedDB session found, checking cloud...', e);
			}

			// If local DB didn't have media (e.g. anonymous visitor on mobile), fetch from Cloud!
			if (!session?.photostripDataUrl && !session?.cloudPhotoUrl && !queryPhoto) {
				await fetchCloudSessionData(sessionId);
			}
		}

		if (typeof window !== 'undefined') {
			try {
				qrCodeDataUrl = await generateQrCodeDataUrl(window.location.href);
			} catch (qrErr) {
				console.warn('[Share] Failed to generate QR code:', qrErr);
			}
		}

		isLoading = false;
	});

	async function handleRetrySync() {
		if (!sessionId) return;
		isLoading = true;
		try {
			await fetchCloudSessionData(sessionId, 3);
		} finally {
			isLoading = false;
		}
	}


	async function triggerDirectDownload(url: string, filename: string): Promise<void> {
		if (url.startsWith('data:')) {
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			return;
		}

		try {
			const res = await fetch(url);
			const blob = await res.blob();
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
		} catch (err) {
			console.warn('[Share] Direct blob download failed, fallback to direct open:', err);
			const a = document.createElement('a');
			a.href = url;
			a.target = '_blank';
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}
	}

	async function downloadPhoto() {
		if (!effectivePhotoUrl || isDownloadingPhoto) return;
		isDownloadingPhoto = true;
		try {
			await triggerDirectDownload(effectivePhotoUrl, `ChekiYuume_${sessionId}_photo.png`);
		} finally {
			isDownloadingPhoto = false;
		}
	}

	async function downloadVideo() {
		if (!effectiveVideoUrl || isDownloadingVideo) return;
		isDownloadingVideo = true;
		try {
			await triggerDirectDownload(effectiveVideoUrl, `ChekiYuume_${sessionId}_video.mp4`);
		} finally {
			isDownloadingVideo = false;
		}
	}

	async function downloadQrCode() {
		if (!qrCodeDataUrl || isDownloadingQr) return;
		isDownloadingQr = true;
		try {
			await triggerDirectDownload(qrCodeDataUrl, `ChekiYuume_${sessionId}_qr.png`);
		} finally {
			isDownloadingQr = false;
		}
	}

	async function downloadAllSequential() {
		if (isDownloadingAll) return;
		isDownloadingAll = true;

		try {
			const tasks: { name: string; action: () => Promise<void> }[] = [];

			if (effectivePhotoUrl) {
				tasks.push({
					name: 'Foto Photostrip',
					action: () => triggerDirectDownload(effectivePhotoUrl!, `ChekiYuume_${sessionId}_photo.png`)
				});
			}

			if (effectiveVideoUrl) {
				tasks.push({
					name: 'Video BTS',
					action: () => triggerDirectDownload(effectiveVideoUrl!, `ChekiYuume_${sessionId}_video.mp4`)
				});
			}

			if (qrCodeDataUrl) {
				tasks.push({
					name: 'QR Code Akses',
					action: () => triggerDirectDownload(qrCodeDataUrl!, `ChekiYuume_${sessionId}_qr.png`)
				});
			}

			for (let i = 0; i < tasks.length; i++) {
				const task = tasks[i];
				downloadAllProgress = `(${i + 1}/${tasks.length}) Mengunduh ${task.name}...`;
				await task.action();
				// Give browser time to process before initiating next download
				if (i < tasks.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, 800));
				}
			}

			downloadAllProgress = '✓ Semua berkas berhasil diunduh!';
			setTimeout(() => {
				downloadAllProgress = '';
			}, 4000);
		} catch (err) {
			console.error('[Share] Sequential download error:', err);
			alert('Pengunduhan selesai. Silakan periksa folder Download atau galeri perangkat kamu.');
		} finally {
			isDownloadingAll = false;
		}
	}
</script>

<div class="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col items-center p-4 sm:p-8 overflow-y-auto">
	<!-- Top Brand Header -->
	<header class="flex flex-col items-center text-center my-6 max-w-md">
		<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 mb-3 shadow-lg">
			<Sparkles class="h-6 w-6" />
		</div>
		<h1 class="text-2xl font-black tracking-tight text-white font-display">
			CHEKIYUUME GALLERY
		</h1>
		<p class="text-xs text-rose-400 font-bold uppercase tracking-wider mt-1">
			Galeri Hasil Photobooth Kamu
		</p>
	</header>

	{#if isLoading || syncStatus === 'checking' || syncStatus === 'retrying'}
		<div class="flex flex-col items-center justify-center my-16 text-zinc-400 text-center max-w-xs">
			<span class="h-8 w-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin mb-4"></span>
			<span class="text-sm font-bold text-white">
				{syncStatus === 'retrying' ? `Menyinkronkan berkas dari cloud (${syncAttempt}/3)...` : 'Memuat galeri foto & video...'}
			</span>
			<span class="text-xs text-zinc-400 mt-1">
				Mohon tunggu sebentar, foto & video kamu sedang disiapkan langsung dari server cloud.
			</span>
		</div>
	{:else if hasMedia}
		<main class="flex flex-col items-center w-full max-w-lg gap-6">
			<!-- Session Info Banner -->
			<div class="w-full rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-center shadow-lg">
				<div class="text-sm font-extrabold text-white">
					Sesi: {effectiveGuestName}
				</div>
				<div class="text-[11px] text-zinc-400 mt-1 flex items-center justify-center gap-1.5">
					<Clock class="h-3.5 w-3.5 text-amber-400" />
					<span>Tersimpan aman di Cloud Gallery</span>
				</div>
			</div>

			<!-- Batch Sequential Download Card -->
			<div class="w-full flex flex-col items-center rounded-3xl bg-gradient-to-br from-rose-950/40 via-zinc-900 to-indigo-950/40 border border-rose-500/30 p-5 shadow-2xl text-center">
				<div class="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-rose-300 mb-1">
					<FolderDown class="h-4 w-4" />
					<span>Unduh Semua Berkas Sekaligus</span>
				</div>
				<p class="text-[11px] text-zinc-400 mb-4 max-w-sm">
					Unduh Foto Photostrip, Video BTS, dan QR Akses satu per satu secara berurutan langsung ke galeri HP tanpa file ZIP.
				</p>

				<button
					type="button"
					onclick={downloadAllSequential}
					disabled={isDownloadingAll}
					class="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-indigo-600 hover:from-rose-600 hover:to-indigo-700 py-3.5 px-6 text-sm font-black text-white shadow-xl shadow-rose-500/20 active:scale-98 transition-all cursor-pointer disabled:opacity-75"
				>
					{#if isDownloadingAll}
						<Loader2 class="h-4 w-4 animate-spin" />
						<span>{downloadAllProgress || 'Mengunduh berurutan...'}</span>
					{:else}
						<Download class="h-4 w-4" />
						<span>Download Semua Berkas (Berurutan)</span>
					{/if}
				</button>

				{#if downloadAllProgress && !isDownloadingAll}
					<div class="mt-2.5 inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold animate-in fade-in duration-200">
						<Check class="h-3.5 w-3.5" />
						<span>{downloadAllProgress}</span>
					</div>
				{/if}
			</div>

			<!-- Photostrip Section -->
			{#if effectivePhotoUrl}
				<div class="w-full flex flex-col items-center rounded-3xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl">
					<div class="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-4 self-start">
						<ImageIcon class="h-4 w-4 text-rose-400" />
						<span>Foto Photostrip (Resolusi Penuh)</span>
					</div>

					<img
						src={effectivePhotoUrl}
						alt="Photostrip"
						class="w-full max-w-[280px] rounded-xl shadow-xl border border-zinc-700/60 object-contain my-2"
					/>

					<button
						type="button"
						onclick={downloadPhoto}
						disabled={isDownloadingPhoto}
						class="w-full mt-4 flex items-center justify-center gap-2 rounded-2xl bg-rose-500 hover:bg-rose-600 py-3.5 px-6 text-sm font-bold text-white shadow-lg shadow-rose-500/25 active:scale-98 transition-all cursor-pointer disabled:opacity-70"
					>
						{#if isDownloadingPhoto}
							<Loader2 class="h-4 w-4 animate-spin" />
							<span>Menyiapkan Download...</span>
						{:else}
							<Download class="h-4 w-4" />
							<span>Unduh Foto (PNG)</span>
						{/if}
					</button>
				</div>
			{/if}

			<!-- Videostrip Section -->
			{#if effectiveVideoUrl}
				<div class="w-full flex flex-col items-center rounded-3xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl">
					<div class="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-4 self-start">
						<Film class="h-4 w-4 text-indigo-400" />
						<span>Sequential Videostrip (BTS Bergerak)</span>
					</div>

					<video
						src={effectiveVideoUrl}
						autoplay
						loop
						muted
						playsinline
						controls
						class="w-full max-w-[280px] rounded-xl shadow-xl border border-zinc-700/60 object-contain my-2 bg-black"
					></video>

					<button
						type="button"
						onclick={downloadVideo}
						disabled={isDownloadingVideo}
						class="w-full mt-4 flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 py-3.5 px-6 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 active:scale-98 transition-all cursor-pointer disabled:opacity-70"
					>
						{#if isDownloadingVideo}
							<Loader2 class="h-4 w-4 animate-spin" />
							<span>Menyiapkan Download...</span>
						{:else}
							<Download class="h-4 w-4" />
							<span>Unduh Video (MP4)</span>
						{/if}
					</button>
				</div>
			{/if}

			<!-- QR Code Section -->
			{#if qrCodeDataUrl}
				<div class="w-full flex flex-col items-center rounded-3xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl">
					<div class="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-2 self-start">
						<QrCode class="h-4 w-4 text-amber-400" />
						<span>QR Code Akses Galeri</span>
					</div>
					<p class="text-[11px] text-zinc-400 mb-4 self-start leading-relaxed">
						Simpan gambar QR Code ini ke galeri HP agar kamu bisa scan atau membuka kembali link galeri ini kapan saja tanpa takut kehilangan tautan.
					</p>

					<div class="bg-white p-3 rounded-2xl shadow-lg border border-zinc-200 my-1 inline-block">
						<img src={qrCodeDataUrl} alt="QR Code Galeri" class="h-36 w-36 object-contain" />
					</div>

					<button
						type="button"
						onclick={downloadQrCode}
						disabled={isDownloadingQr}
						class="w-full mt-4 flex items-center justify-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-600 py-3.5 px-6 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/20 active:scale-98 transition-all cursor-pointer disabled:opacity-70"
					>
						{#if isDownloadingQr}
							<Loader2 class="h-4 w-4 animate-spin" />
							<span>Menyiapkan QR Code...</span>
						{:else}
							<Download class="h-4 w-4" />
							<span>Unduh QR Code (PNG)</span>
						{/if}
					</button>
				</div>
			{/if}
		</main>
	{:else}
		<!-- Fallback when accessed without matching local DB session or params -->
		<div class="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 p-8 text-center shadow-xl">
			<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 mb-4">
				<Clock class="h-7 w-7" />
			</div>
			<h2 class="text-xl font-bold text-white font-display">Berkas Sedang Diproses</h2>
			<p class="text-xs text-zinc-400 mt-2 leading-relaxed">
				ID Sesi: <strong class="text-rose-400">{sessionId}</strong><br />
				Kiosk photobooth sedang mengunggah atau menyelesaikan berkas fotomu ke cloud. Halaman galeri ini bebas diakses tanpa perlu login admin.
			</p>

			<div class="mt-6 flex flex-col gap-2">
				<button
					type="button"
					onclick={handleRetrySync}
					class="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-500 hover:bg-rose-600 py-3.5 px-6 text-sm font-bold text-white shadow-lg shadow-rose-500/25 active:scale-98 transition-all cursor-pointer"
				>
					<RotateCcw class="h-4 w-4" />
					<span>Cek Ulang Berkas Sekarang</span>
				</button>
				<p class="text-[10px] text-zinc-500 mt-1">
					Jika setelah beberapa saat berkas belum muncul, kamu bisa menghubungi operator booth dengan menyebutkan ID Sesi di atas.
				</p>
			</div>
		</div>
	{/if}

	<footer class="mt-12 text-center text-[10px] text-zinc-600 uppercase tracking-widest pb-6">
		ChekiYuume Photobooth Experience
	</footer>
</div>
