<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { settingsStore } from '$lib/stores/settings';
	import { networkStore, initNetworkMonitor } from '$lib/services/networkStatus';
	import { isFullscreen, toggleFullscreen, onFullscreenChange } from '$lib/utils/fullscreen';
	import { Lock, X, ArrowRight, Shield, Maximize2, Minimize2, WifiOff, CheckCircle2, Eye, EyeOff } from '@lucide/svelte';

	let { children } = $props();

	let tapCount = $state(0);
	let tapTimer: NodeJS.Timeout | null = null;
	let showPinModal = $state(false);
	let pinInput = $state('');
	let pinError = $state('');
	let showPinReveal = $state(false);
	let isFullscreenActive = $state(false);

	onMount(() => {
		isFullscreenActive = isFullscreen();
		const unbindFullscreen = onFullscreenChange((active) => {
			isFullscreenActive = active;
		});

		// Initialize service worker for complete offline caching
		if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch((err) => {
				console.warn('[SW] Registration failed:', err);
			});
		}

		// Initialize real-time network detection & auto-switching
		initNetworkMonitor();

		// Dynamically sync admin PIN from Cloudflare Pages environment if online
		fetch('/api/config')
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data && data.adminPin) {
					settingsStore.updateSettings({ adminPin: data.adminPin });
				}
			})
			.catch(() => {});

		return () => {
			unbindFullscreen();
		};
	});

	function handleSecretTap() {
		tapCount++;
		if (tapTimer) clearTimeout(tapTimer);

		if (tapCount >= 5) {
			tapCount = 0;
			showPinModal = true;
		} else {
			tapTimer = setTimeout(() => {
				tapCount = 0;
			}, 1500);
		}
	}

	async function handlePinSubmit() {
		const correctPin = ($settingsStore.adminPin || '1234').trim();
		const input = pinInput.trim();

		if (input === correctPin) {
			showPinModal = false;
			pinInput = '';
			pinError = '';
			goto('/admin');
			return;
		}

		// Also check live against /api/config in case store hasn't synced yet
		try {
			const res = await fetch('/api/config');
			if (res.ok) {
				const data = await res.json();
				if (data && data.adminPin && input === String(data.adminPin).trim()) {
					settingsStore.updateSettings({ adminPin: data.adminPin });
					showPinModal = false;
					pinInput = '';
					pinError = '';
					goto('/admin');
					return;
				}
			}
		} catch (e) {
			// offline fallback
		}

		pinError = 'PIN salah. Coba lagi.';
		pinInput = '';
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
			showPinModal = true;
		}
		if (e.key === 'F11' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f')) {
			e.preventDefault();
			toggleFullscreen();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<main class="relative h-screen w-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden font-sans select-none">
	<!-- Fullscreen Quick Toggle (Top Left) -->
	<button
		type="button"
		onclick={() => toggleFullscreen()}
		class="fixed top-3 left-3 z-40 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-black/40 hover:bg-black/80 text-zinc-400 hover:text-white border border-zinc-800/60 backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-md opacity-40 hover:opacity-100"
		title={isFullscreenActive ? 'Keluar Layar Penuh (F11)' : 'Masuk Layar Penuh (F11)'}
		aria-label="Toggle Fullscreen"
	>
		{#if isFullscreenActive}
			<Minimize2 class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
		{:else}
			<Maximize2 class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
		{/if}
	</button>

	<!-- Secret Admin Trigger Hotspot (Top Right Corner) -->
	<button
		type="button"
		onclick={handleSecretTap}
		class="fixed top-0 right-0 z-50 h-16 w-16 opacity-0 hover:opacity-10 cursor-default"
		title="Admin"
		aria-label="Admin Trigger"
	></button>

	<!-- Real-Time Network Status Indicator Banners -->
	{#if !$networkStore.isOnline}
		<div class="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-amber-500/95 text-zinc-950 px-4 py-1.5 rounded-full text-xs font-black shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none select-none border border-amber-400">
			<span class="flex h-2 w-2 rounded-full bg-red-600 animate-ping"></span>
			<WifiOff class="h-3.5 w-3.5" />
			<span>Mode Offline Aktif (Sesi Disimpan ke Database Lokal)</span>
		</div>
	{:else if $networkStore.reconnectedNotification}
		<div class="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-500/95 text-white px-4 py-1.5 rounded-full text-xs font-black shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none select-none border border-emerald-400">
			<CheckCircle2 class="h-3.5 w-3.5" />
			<span>Koneksi Internet Pulih — Otomatis Beralih ke Cloud</span>
		</div>
	{/if}

	<!-- Main App Content -->
	<div class="flex-1 flex flex-col h-full w-full overflow-hidden">
		{@render children()}
	</div>

	<!-- Admin PIN Modal -->
	{#if showPinModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6 animate-in fade-in duration-200">
			<div class="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl text-center">
				<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 mb-5">
					<Shield class="h-7 w-7" />
				</div>

				<h3 class="text-2xl font-black text-white font-display">Akses Admin Kiosk</h3>
				<p class="text-xs text-zinc-400 mt-1">Masukkan PIN untuk membuka pengaturan booth</p>

				<div>
					<div class="mt-6 relative flex items-center justify-center">
						<input
							type={showPinReveal ? 'text' : 'password'}
							bind:value={pinInput}
							maxlength="6"
							placeholder={showPinReveal ? '1234' : '••••'}
							class="w-full text-center {showPinReveal ? 'tracking-[0.4em]' : 'tracking-[1em]'} text-3xl font-black rounded-2xl bg-zinc-800 border border-zinc-700 py-3 pl-12 pr-12 text-white focus:border-rose-500 focus:outline-hidden font-mono"
							onkeydown={(e) => e.key === 'Enter' && handlePinSubmit()}
							autofocus
						/>
						<button
							type="button"
							onclick={() => (showPinReveal = !showPinReveal)}
							class="absolute right-3 p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-700/60 transition-colors cursor-pointer"
							title={showPinReveal ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
							aria-label={showPinReveal ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
						>
							{#if showPinReveal}
								<EyeOff class="h-5 w-5" />
							{:else}
								<Eye class="h-5 w-5" />
							{/if}
						</button>
					</div>
					{#if pinError}
						<p class="text-xs font-semibold text-rose-400 mt-2">{pinError}</p>
					{/if}
				</div>

				<div class="mt-6 flex gap-2">
					<button
						type="button"
						onclick={() => { showPinModal = false; pinInput = ''; pinError = ''; }}
						class="w-1/2 rounded-xl bg-zinc-800 py-3 text-xs font-bold text-zinc-300 hover:bg-zinc-700 cursor-pointer"
					>
						Batal
					</button>
					<button
						type="button"
						onclick={handlePinSubmit}
						class="w-1/2 rounded-xl bg-rose-500 py-3 text-xs font-bold text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20 cursor-pointer"
					>
						Masuk
					</button>
				</div>
			</div>
		</div>
	{/if}
</main>
