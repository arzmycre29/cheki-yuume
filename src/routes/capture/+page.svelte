<script lang="ts">
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import { getLayoutById } from '$lib/config/frameLayouts';
	import DefaultCaptureFlow from '$lib/components/modes/DefaultCaptureFlow.svelte';
	import CreativeCaptureFlow from '$lib/components/modes/CreativeCaptureFlow.svelte';
	import CreativeArranger from '$lib/components/modes/CreativeArranger.svelte';
	import { ArrowLeft, AlertCircle } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let session = $derived($sessionStore);
	let currentLayout = $derived(getLayoutById(session.layoutId));

	let creativeStep = $state<'capturing' | 'arranging'>('capturing');
	let showConfirmExitModal = $state(false);

	onMount(() => {
		const currentSession = sessionStore.hydrate();
		if (!currentSession.sessionId) {
			goto('/');
			return;
		}

		// Prevent Android hardware back button from immediately exiting the app
		window.history.pushState(null, '', window.location.href);
		const handlePopState = () => {
			window.history.pushState(null, '', window.location.href);
			handleRequestBack();
		};
		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	});

	function handleRequestBack() {
		if (session.photos && session.photos.length > 0) {
			showConfirmExitModal = true;
		} else {
			confirmBackToHome();
		}
	}

	function confirmBackToHome() {
		showConfirmExitModal = false;
		goto('/');
	}

	function handleFinishDefault() {
		goto('/processing');
	}

	function handleFinish8Shots() {
		creativeStep = 'arranging';
	}

	function handleFinishArrangement() {
		goto('/processing');
	}
</script>

<div class="relative h-full w-full flex flex-col justify-center items-center overflow-hidden">
	<!-- Floating Back Button on Top Left -->
	<button
		type="button"
		onclick={handleRequestBack}
		class="fixed top-2.5 left-2.5 sm:top-4 sm:left-4 z-40 flex items-center gap-1.5 rounded-2xl bg-zinc-900/85 hover:bg-zinc-800/90 border border-zinc-700/80 backdrop-blur-md px-3 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-bold text-white shadow-xl shadow-black/40 cursor-pointer active:scale-95 transition-all"
		title="Kembali ke pemilihan frame"
	>
		<ArrowLeft class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-400" />
		<span>Kembali</span>
	</button>

	{#if session.mode === 'default'}
		<DefaultCaptureFlow
			layout={currentLayout}
			onFinishCapture={handleFinishDefault}
		/>
	{:else}
		{#if creativeStep === 'capturing'}
			<CreativeCaptureFlow
				layout={currentLayout}
				onFinish8Shots={handleFinish8Shots}
			/>
		{:else}
			<CreativeArranger
				onFinishArrangement={handleFinishArrangement}
			/>
		{/if}
	{/if}

	<!-- Confirmation Modal on Exit during Active Session -->
	{#if showConfirmExitModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
			<div class="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-5 sm:p-6 shadow-2xl flex flex-col items-center text-center">
				<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 mb-3 border border-rose-500/30">
					<AlertCircle class="h-6 w-6" />
				</div>
				<h3 class="text-base sm:text-lg font-bold text-white font-display mb-1.5">
					Kembali ke Menu Awal?
				</h3>
				<p class="text-xs text-zinc-400 mb-5 leading-relaxed">
					Foto ({session.photos.length} foto) yang telah diambil pada sesi ini akan dibatalkan jika Anda kembali ke awal.
				</p>
				<div class="grid grid-cols-2 gap-3 w-full">
					<button
						type="button"
						onclick={() => (showConfirmExitModal = false)}
						class="rounded-2xl bg-zinc-800 hover:bg-zinc-700 py-2.5 text-xs font-bold text-zinc-300 transition-all cursor-pointer"
					>
						Lanjut Foto
					</button>
					<button
						type="button"
						onclick={confirmBackToHome}
						class="rounded-2xl bg-rose-500 hover:bg-rose-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-500/30 transition-all cursor-pointer"
					>
						Ya, Batalkan
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
