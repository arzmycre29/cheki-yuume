<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import { settingsStore } from '$lib/stores/settings';
	import { generateQrCodeDataUrl } from '$lib/services/cloudStorage';
	import PrintModal from '$lib/components/PrintModal.svelte';
	import confetti from 'canvas-confetti';
	import {
		Printer,
		QrCode,
		RotateCcw,
		Sparkles,
		Film,
		Image as ImageIcon,
		Download,
		Share2,
		CheckCircle2
	} from '@lucide/svelte';

	let session = $derived($sessionStore);
	let settings = $derived($settingsStore);

	let activePreviewTab = $state<'photo' | 'video'>('photo');
	let isPrintModalOpen = $state(false);
	let qrCodeDataUrl = $state('');
	let remainingResetSeconds = $state(60);
	let resetInterval: NodeJS.Timeout | null = null;

	onMount(async () => {
		const currentSession = sessionStore.hydrate();
		if (!currentSession.sessionId || (!currentSession.photostripDataUrl && !currentSession.videostripUrl)) {
			// Try to load from IndexedDB before giving up
			if (currentSession.sessionId) {
				const fromDB = await getSessionFromDB(currentSession.sessionId);
				if (fromDB && fromDB.photostripDataUrl) {
					sessionStore.setPhotostrip(fromDB.photostripDataUrl, fromDB.photostripBlob || new Blob());
					if (fromDB.videostripBlob && fromDB.videostripUrl) {
						sessionStore.setVideostrip(fromDB.videostripBlob, fromDB.videostripUrl);
					}
				} else {
					goto('/');
					return;
				}
			} else {
				goto('/');
				return;
			}
		}

		// Save completed session to persistent IndexedDB
		sessionStore.finalizeAndSaveSession();

		// Fire celebration confetti
		try {
			confetti({
				particleCount: 80,
				spread: 70,
				origin: { y: 0.6 }
			});
		} catch (e) {}

		// Generate QR Code
		const shareTargetUrl = session.cloudShareUrl || `${window.location.origin}/share/${session.sessionId}`;
		qrCodeDataUrl = await generateQrCodeDataUrl(shareTargetUrl);

		// Start Auto-reset Timer
		remainingResetSeconds = settings.autoResetSeconds || 90;
		resetInterval = setInterval(() => {
			if (remainingResetSeconds > 1) {
				remainingResetSeconds--;
			} else {
				handleFinishSession();
			}
		}, 1000);
	});

	onDestroy(() => {
		if (resetInterval) clearInterval(resetInterval);
	});

	function handleFinishSession() {
		if (resetInterval) clearInterval(resetInterval);
		sessionStore.reset();
		goto('/');
	}

	import { createSessionExportZip } from '$lib/services/db';

	function handleDownloadPhoto() {
		if (session.photostripDataUrl) {
			const a = document.createElement('a');
			a.href = session.photostripDataUrl;
			a.download = `ChekiYuume_${session.sessionId}_photo.png`;
			a.click();
		}
	}

	function handleDownloadVideo() {
		const videoSrc = session.videostripUrl || (session.videostripBlob ? URL.createObjectURL(session.videostripBlob) : null);
		if (videoSrc) {
			const a = document.createElement('a');
			a.href = videoSrc;
			a.download = `ChekiYuume_${session.sessionId}_video.mp4`;
			a.click();
		}
	}

	async function handleDownloadZip() {
		try {
			const zipBlob = await createSessionExportZip(session);
			const url = URL.createObjectURL(zipBlob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `ChekiYuume_${session.sessionId}_complete.zip`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 10000);
		} catch (err) {
			console.error('Failed to create ZIP bundle:', err);
		}
	}
</script>

<div class="flex flex-col h-full w-full max-w-7xl mx-auto p-4 sm:p-6 gap-6 overflow-hidden">
	<!-- Top Bar -->
	<div class="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 rounded-3xl p-4 shadow-xl shrink-0">
		<div class="flex items-center gap-3">
			<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
				<CheckCircle2 class="h-6 w-6" />
			</div>
			<div>
				<h1 class="text-xl font-black text-white font-display">Sesi Foto Selesai!</h1>
				<p class="text-xs text-zinc-400">
					Sesi: <span class="text-rose-400 font-bold">{session.guestName || 'Tamu'}</span> [{session.sessionId.slice(-9)}]
				</p>
			</div>
		</div>

		<!-- Auto-Reset Indicator & Finish Button -->
		<div class="flex items-center gap-3">
			<div class="hidden sm:flex items-center gap-2 rounded-2xl bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-zinc-400 border border-zinc-700/50">
				<RotateCcw class="h-3.5 w-3.5 animate-spin-slow text-amber-400" />
				<span>Reset otomatis: <strong class="text-white">{remainingResetSeconds}s</strong></span>
			</div>

			<button
				type="button"
				onclick={handleFinishSession}
				class="flex items-center gap-2 rounded-2xl bg-zinc-800 hover:bg-rose-500 hover:text-white px-5 py-2.5 text-xs font-bold text-zinc-200 border border-zinc-700 transition-all cursor-pointer"
			>
				<span>Selesai & Sesi Baru</span>
			</button>
		</div>
	</div>

	<!-- Main Content: Split View (Left: Preview, Right: Actions & QR) -->
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
		<!-- Left: Media Preview Strip (7 cols) -->
		<div class="lg:col-span-7 flex flex-col items-center justify-center bg-zinc-900/60 border border-zinc-800 rounded-3xl p-4 shadow-xl overflow-y-auto">
			<!-- Preview Tab Selector -->
			<div class="flex items-center gap-2 bg-zinc-800/80 p-1.5 rounded-2xl border border-zinc-700/50 mb-4 shrink-0">
				<button
					type="button"
					onclick={() => (activePreviewTab = 'photo')}
					class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer {activePreviewTab === 'photo' ? 'bg-rose-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'}"
				>
					<ImageIcon class="h-4 w-4" />
					<span>Photostrip Foto (2D)</span>
				</button>
				<button
					type="button"
					onclick={() => (activePreviewTab = 'video')}
					class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer {activePreviewTab === 'video' ? 'bg-rose-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'}"
				>
					<Film class="h-4 w-4" />
					<span>Sequential Videostrip (MP4)</span>
				</button>
			</div>

			<!-- Media Container -->
			<div class="flex items-center justify-center flex-1 w-full p-2">
				{#if activePreviewTab === 'photo'}
					{#if session.photostripDataUrl}
						<img
							src={session.photostripDataUrl}
							alt="Photostrip Final"
							class="max-h-[60vh] max-w-full rounded-2xl shadow-2xl border border-zinc-700/40 object-contain animate-in fade-in zoom-in-95 duration-300"
						/>
					{:else}
						<div class="text-zinc-500 text-sm">Pratinjau foto sedang disiapkan...</div>
					{/if}
				{:else}
					{#if session.videostripUrl}
						<video
							src={session.videostripUrl}
							autoplay
							loop
							muted
							playsinline
							controls
							class="max-h-[60vh] max-w-full rounded-2xl shadow-2xl border border-zinc-700/40 object-contain animate-in fade-in zoom-in-95 duration-300 bg-black"
						></video>
					{:else}
						<div class="text-zinc-500 text-sm">Videostrip sedang diproses...</div>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Right: QR Code & Print Action Panel (5 cols) -->
		<div class="lg:col-span-5 flex flex-col justify-between bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl overflow-y-auto gap-6">
			<!-- QR Scan Section -->
			<div class="flex flex-col items-center text-center bg-zinc-950/80 rounded-2xl p-5 border border-zinc-800">
				<div class="flex items-center gap-2 text-rose-400 text-xs font-extrabold uppercase tracking-wider mb-3">
					<QrCode class="h-4 w-4" />
					<span>Scan QR untuk Download ke HP</span>
				</div>

				{#if qrCodeDataUrl}
					<div class="bg-white p-3 rounded-2xl shadow-2xl border-4 border-white inline-block">
						<img src={qrCodeDataUrl} alt="QR Code Share" class="h-44 w-44 object-contain" />
					</div>
				{:else}
					<div class="h-44 w-44 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs">
						Membuat QR Code...
					</div>
				{/if}

				<p class="text-[11px] text-zinc-400 mt-3 max-w-xs">
					Arahkan kamera smartphone ke QR Code di atas untuk membuka galeri download foto & videostrip kamu.
				</p>
			</div>

			<!-- Action Buttons -->
			<div class="flex flex-col gap-3">
				<!-- Print Button -->
				<button
					type="button"
					onclick={() => (isPrintModalOpen = true)}
					class="w-full flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-600 to-rose-500 py-3.5 px-6 text-base font-extrabold text-white shadow-xl shadow-indigo-500/20 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
				>
					<Printer class="h-5 w-5" />
					<span>Cetak Foto Fisik (Print)</span>
				</button>

				<!-- Download Photo Button -->
				<button
					type="button"
					onclick={handleDownloadPhoto}
					class="w-full flex items-center justify-center gap-2 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700/80 py-2.5 px-4 text-xs font-bold text-zinc-200 border border-zinc-700/60 transition-all cursor-pointer"
				>
					<ImageIcon class="h-4 w-4 text-rose-400" />
					<span>Unduh Foto Strip (.PNG)</span>
				</button>

				<!-- Download Video Button -->
				<button
					type="button"
					onclick={handleDownloadVideo}
					class="w-full flex items-center justify-center gap-2 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700/80 py-2.5 px-4 text-xs font-bold text-zinc-200 border border-zinc-700/60 transition-all cursor-pointer"
				>
					<Film class="h-4 w-4 text-indigo-400" />
					<span>Unduh Video Strip (.MP4)</span>
				</button>

				<!-- Download ZIP Bundle Button -->
				<button
					type="button"
					onclick={handleDownloadZip}
					class="w-full flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 hover:bg-zinc-800 py-2.5 px-4 text-xs font-bold text-zinc-400 border border-zinc-800 hover:text-white transition-all cursor-pointer"
				>
					<Download class="h-4 w-4 text-emerald-400" />
					<span>Unduh Arsip Lengkap (.ZIP)</span>
				</button>
			</div>
		</div>
	</div>

	<!-- Print Dialog Modal -->
	{#if session.photostripDataUrl}
		<PrintModal
			isOpen={isPrintModalOpen}
			photostripDataUrl={session.photostripDataUrl}
			onClose={() => (isPrintModalOpen = false)}
		/>
	{/if}
</div>
