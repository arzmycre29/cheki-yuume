<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getSessionFromDB } from '$lib/services/db';
	import type { SessionData } from '$lib/types';
	import { Download, Film, Image as ImageIcon, Sparkles, Clock, CheckCircle2 } from '@lucide/svelte';

	let sessionId = $derived(page.params.sessionId);
	let session = $state<SessionData | null>(null);
	let isLoading = $state(true);

	onMount(async () => {
		if (sessionId) {
			session = await getSessionFromDB(sessionId);
		}
		isLoading = false;
	});

	function downloadPhoto() {
		if (session?.photostripDataUrl) {
			const a = document.createElement('a');
			a.href = session.photostripDataUrl;
			a.download = `ChekiYuume_${sessionId}.png`;
			a.click();
		}
	}

	function downloadVideo() {
		if (session?.videostripUrl) {
			const a = document.createElement('a');
			a.href = session.videostripUrl;
			a.download = `ChekiYuume_${sessionId}.mp4`;
			a.click();
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

	{#if isLoading}
		<div class="flex flex-col items-center justify-center my-16 text-zinc-500">
			<span class="h-6 w-6 rounded-full border-2 border-rose-500 border-t-transparent animate-spin mb-3"></span>
			<span class="text-xs font-semibold">Memuat berkas sesi...</span>
		</div>
	{:else if session}
		<main class="flex flex-col items-center w-full max-w-lg gap-6">
			<!-- Session Info Banner -->
			<div class="w-full rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-center shadow-lg">
				<div class="text-sm font-extrabold text-white">
					Sesi: {session.guestName || 'Tamu Istimewa'}
				</div>
				<div class="text-[11px] text-zinc-400 mt-1 flex items-center justify-center gap-1.5">
					<Clock class="h-3.5 w-3.5 text-amber-400" />
					<span>Tersimpan aman selama 30 hari</span>
				</div>
			</div>

			<!-- Photostrip Section -->
			{#if session.photostripDataUrl}
				<div class="w-full flex flex-col items-center rounded-3xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl">
					<div class="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-4 self-start">
						<ImageIcon class="h-4 w-4 text-rose-400" />
						<span>Foto Photostrip (Resolusi Penuh)</span>
					</div>

					<img
						src={session.photostripDataUrl}
						alt="Photostrip"
						class="w-full max-w-[280px] rounded-xl shadow-xl border border-zinc-700/60 object-contain my-2"
					/>

					<button
						type="button"
						onclick={downloadPhoto}
						class="w-full mt-4 flex items-center justify-center gap-2 rounded-2xl bg-rose-500 hover:bg-rose-600 py-3.5 px-6 text-sm font-bold text-white shadow-lg shadow-rose-500/25 active:scale-98 transition-all cursor-pointer"
					>
						<Download class="h-4 w-4" />
						<span>Unduh Foto (PNG)</span>
					</button>
				</div>
			{/if}

			<!-- Videostrip Section -->
			{#if session.videostripUrl}
				<div class="w-full flex flex-col items-center rounded-3xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl">
					<div class="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-4 self-start">
						<Film class="h-4 w-4 text-indigo-400" />
						<span>Sequential Videostrip (BTS Bergerak)</span>
					</div>

					<video
						src={session.videostripUrl}
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
						class="w-full mt-4 flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 py-3.5 px-6 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 active:scale-98 transition-all cursor-pointer"
					>
						<Download class="h-4 w-4" />
						<span>Unduh Video (MP4)</span>
					</button>
				</div>
			{/if}
		</main>
	{:else}
		<!-- Fallback when accessed without matching local DB session -->
		<div class="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 p-8 text-center shadow-xl">
			<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 mb-4">
				<Clock class="h-7 w-7" />
			</div>
			<h2 class="text-xl font-bold text-white font-display">Sesi Telah Terdaftar</h2>
			<p class="text-xs text-zinc-400 mt-2 leading-relaxed">
				ID Sesi: <strong class="text-rose-400">{sessionId}</strong><br />
				Jika kamu baru saja berfoto di kiosk lokal, hubungi operator booth dengan menyebutkan ID Sesi di atas untuk mengambil berkas digital fotomu.
			</p>
		</div>
	{/if}

	<footer class="mt-12 text-center text-[10px] text-zinc-600 uppercase tracking-widest pb-6">
		ChekiYuume Photobooth Experience
	</footer>
</div>
