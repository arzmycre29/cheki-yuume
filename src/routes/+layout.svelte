<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { settingsStore } from '$lib/stores/settings';
	import { Lock, X, ArrowRight, Shield } from '@lucide/svelte';

	let { children } = $props();

	let tapCount = $state(0);
	let tapTimer: NodeJS.Timeout | null = null;
	let showPinModal = $state(false);
	let pinInput = $state('');
	let pinError = $state('');

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

	function handlePinSubmit() {
		const correctPin = $settingsStore.adminPin || '1234';
		if (pinInput === correctPin) {
			showPinModal = false;
			pinInput = '';
			pinError = '';
			goto('/admin');
		} else {
			pinError = 'PIN salah. Coba lagi.';
			pinInput = '';
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
			showPinModal = true;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<main class="relative h-screen w-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden font-sans select-none">
	<!-- Secret Admin Trigger Hotspot (Top Right Corner) -->
	<button
		type="button"
		onclick={handleSecretTap}
		class="fixed top-0 right-0 z-50 h-16 w-16 opacity-0 hover:opacity-10 cursor-default"
		title="Admin"
		aria-label="Admin Trigger"
	></button>

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

				<div class="mt-6">
					<input
						type="password"
						bind:value={pinInput}
						maxlength="6"
						placeholder="••••"
						class="w-full text-center tracking-[1em] text-3xl font-black rounded-2xl bg-zinc-800 border border-zinc-700 py-3 text-white focus:border-rose-500 focus:outline-hidden"
						onkeydown={(e) => e.key === 'Enter' && handlePinSubmit()}
						autofocus
					/>
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
