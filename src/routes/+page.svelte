<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import { settingsStore } from '$lib/stores/settings';
	import { customFramesStore } from '$lib/stores/customFrames';
	import type { CaptureMode, FrameLayout } from '$lib/types';
	import {
		DEFAULT_SLOT_OPTIONS,
		getFramesBySlotCount,
		ALL_FRAME_TEMPLATES
	} from '$lib/config/frameLayouts';
	import GuestNameModal from '$lib/components/GuestNameModal.svelte';
	import {
		Camera,
		Sparkles,
		Zap,
		ArrowRight,
		ArrowLeft,
		Settings,
		Shield,
		Check,
		Palette
	} from '@lucide/svelte';

	let step = $state<'attract' | 'mode-select' | 'slot-select' | 'theme-select'>('attract');
	let selectedMode = $state<CaptureMode>('default');
	let selectedSlotCount = $state<number>(4);
	let selectedLayout = $state<FrameLayout>(ALL_FRAME_TEMPLATES[10]); // 4-Cut Classic White
	let isNameModalOpen = $state(false);

	// Auto-hide Admin Button after 3 seconds
	let isAdminButtonVisible = $state(true);

	// Admin PIN modal
	let showAdminPinModal = $state(false);
	let adminPinInput = $state('');
	let adminPinError = $state('');

	let allFrames = $derived($customFramesStore);
	let availableThemesForSlot = $derived(getFramesBySlotCount(allFrames, selectedSlotCount));

	onMount(() => {
		const hideTimer = setTimeout(() => {
			isAdminButtonVisible = false;
		}, 3000);

		return () => clearTimeout(hideTimer);
	});

	function handleStart() {
		step = 'mode-select';
	}

	function chooseMode(mode: CaptureMode) {
		selectedMode = mode;
		if (mode === 'default') {
			step = 'slot-select';
		} else {
			// Creative mode: starts 8-shot capture then chooses custom frame
			selectedLayout = ALL_FRAME_TEMPLATES[10];
			isNameModalOpen = true;
		}
	}

	function handleSelectSlotCount(count: number) {
		selectedSlotCount = count;
		const matchingFrames = getFramesBySlotCount(allFrames, count);
		selectedLayout = matchingFrames[0] || ALL_FRAME_TEMPLATES[0];
		step = 'theme-select'; // Next: Choose Frame Theme for this slot count!
	}

	function handleSelectTheme(layout: FrameLayout) {
		selectedLayout = layout;
		isNameModalOpen = true; // Open Guest Name Modal
	}

	function handleConfirmName(guestName: string) {
		isNameModalOpen = false;
		sessionStore.initNewSession(selectedMode, guestName, selectedLayout.id);
		sessionStore.setLayout(selectedLayout.id, selectedLayout.totalSlots);
		goto('/capture');
	}

	function handleAdminPinSubmit() {
		const correctPin = $settingsStore.adminPin || '1234';
		if (adminPinInput === correctPin) {
			showAdminPinModal = false;
			adminPinInput = '';
			adminPinError = '';
			goto('/admin');
		} else {
			adminPinError = 'PIN salah. Coba lagi.';
			adminPinInput = '';
		}
	}
</script>

<div class="relative flex h-full w-full flex-col items-center justify-center p-6 overflow-hidden select-none">
	<!-- Background Ambient Glow -->
	<div class="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-rose-500/15 blur-3xl pointer-events-none"></div>
	<div class="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none"></div>

	<!-- Top Right: Obvious Admin Button (Auto-hides after 3s) -->
	<div class="fixed top-6 right-6 z-40 transition-opacity duration-700 {isAdminButtonVisible ? 'opacity-100' : 'opacity-0 hover:opacity-100'}">
		<button
			type="button"
			onclick={() => (showAdminPinModal = true)}
			class="flex items-center gap-2 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white shadow-lg backdrop-blur-md transition-all cursor-pointer"
			title="Buka Pengaturan Admin"
		>
			<Settings class="h-4 w-4 text-rose-400" />
			<span>Admin</span>
		</button>
	</div>

	{#if step === 'attract'}
		<!-- Screen 1: Attract / Tap to Start -->
		<button
			type="button"
			onclick={handleStart}
			class="group relative flex flex-col items-center justify-center text-center cursor-pointer max-w-2xl animate-in fade-in duration-500"
		>
			<div class="relative mb-8 flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-tr from-rose-500 to-indigo-600 shadow-2xl shadow-rose-500/30 group-hover:scale-105 transition-transform duration-300">
				<Camera class="h-14 w-14 text-white" />
				<span class="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-zinc-950 font-bold shadow-md">
					<Sparkles class="h-4 w-4" />
				</span>
			</div>

			<h1 class="text-6xl sm:text-7xl font-black tracking-tight text-white font-display">
				{$settingsStore.kioskTitle || 'CHEKIYUUME'}
			</h1>
			<p class="mt-3 text-lg font-bold tracking-widest text-rose-400 uppercase">
				{$settingsStore.kioskSubtitle || 'PHOTOBOOTH STUDIO'}
			</p>
			<p class="mt-4 text-sm text-zinc-400 max-w-md">
				Abadikan momen seru dengan foto beresolusi tinggi dan video animasi *sequential BTS* kekinian.
			</p>

			<div class="mt-12 flex items-center gap-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-8 py-4 backdrop-blur-md shadow-2xl transition-all group-hover:scale-105">
				<span class="h-3 w-3 rounded-full bg-rose-500 animate-ping"></span>
				<span class="text-base font-extrabold uppercase tracking-wider text-white">Sentuh Layar untuk Mulai</span>
				<ArrowRight class="h-5 w-5 text-rose-400 group-hover:translate-x-1 transition-transform" />
			</div>
		</button>

	{:else if step === 'mode-select'}
		<!-- Screen 2: Mode Selection (Default vs Creative) -->
		<div class="flex flex-col items-center max-w-5xl w-full text-center animate-in fade-in zoom-in-95 duration-300">
			<button
				type="button"
				onclick={() => (step = 'attract')}
				class="self-start flex items-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white mb-6 cursor-pointer"
			>
				<ArrowLeft class="h-4 w-4" />
				<span>Kembali</span>
			</button>

			<h2 class="text-4xl sm:text-5xl font-black text-white font-display">
				Pilih Mode Photobooth
			</h2>
			<p class="mt-2 text-sm text-zinc-400 max-w-lg">
				Pilih alur cepat dengan preset strip atau eksplorasi kreatif dengan 8 pose
			</p>

			<div class="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
				<!-- Mode Default Card -->
				<button
					type="button"
					onclick={() => chooseMode('default')}
					class="group relative flex flex-col items-center justify-between rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 text-center transition-all duration-300 hover:border-rose-500/60 hover:bg-zinc-900 hover:scale-[1.02] hover:shadow-2xl hover:shadow-rose-500/10 cursor-pointer"
				>
					<div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-6 group-hover:scale-110 transition-transform">
						<Zap class="h-8 w-8" />
					</div>

					<span class="rounded-full bg-rose-500/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-rose-300 border border-rose-500/30 mb-3">
						Rekomendasi Cepat
					</span>

					<h3 class="text-2xl font-black text-white font-display">
						Mode Default (Preset)
					</h3>
					<p class="mt-2 text-xs text-zinc-400 leading-relaxed">
						Pilih 1 s/d 4 slot foto lalu pilih tema desain frame. Foto langsung terisi otomatis ke dalam frame saat kamu berpose.
					</p>

					<div class="mt-8 flex items-center gap-2 rounded-2xl bg-zinc-800/80 px-6 py-3 text-xs font-bold text-white group-hover:bg-rose-500 transition-colors">
						<span>Pilih Mode Default</span>
						<ArrowRight class="h-4 w-4" />
					</div>
				</button>

				<!-- Mode Creative Card -->
				<button
					type="button"
					onclick={() => chooseMode('creative')}
					class="group relative flex flex-col items-center justify-between rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 text-center transition-all duration-300 hover:border-indigo-500/60 hover:bg-zinc-900 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/10 cursor-pointer"
				>
					<div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-6 group-hover:scale-110 transition-transform">
						<Sparkles class="h-8 w-8" />
					</div>

					<span class="rounded-full bg-indigo-500/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-indigo-300 border border-indigo-500/30 mb-3">
						Bebas Berkreasi
					</span>

					<h3 class="text-2xl font-black text-white font-display">
						Mode Creative (8 Pose)
					</h3>
					<p class="mt-2 text-xs text-zinc-400 leading-relaxed">
						Ambil 8 pose foto sepuasnya, lalu pilih frame kustom bertema aesthetic dan tata foto terbaikmu ke dalam slot frame.
					</p>

					<div class="mt-8 flex items-center gap-2 rounded-2xl bg-zinc-800/80 px-6 py-3 text-xs font-bold text-white group-hover:bg-indigo-500 transition-colors">
						<span>Pilih Mode Creative</span>
						<ArrowRight class="h-4 w-4" />
					</div>
				</button>
			</div>
		</div>

	{:else if step === 'slot-select'}
		<!-- Step 3A: Select Slot Count (1, 2, 3, 4 Strip) -->
		<div class="flex flex-col items-center max-w-6xl w-full text-center animate-in fade-in duration-300">
			<button
				type="button"
				onclick={() => (step = 'mode-select')}
				class="self-start flex items-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white mb-4 cursor-pointer"
			>
				<ArrowLeft class="h-4 w-4" />
				<span>Pilih Mode Lain</span>
			</button>

			<h2 class="text-3xl sm:text-4xl font-black text-white font-display">
				Pilih Jumlah Strip Foto
			</h2>
			<p class="mt-2 text-xs text-zinc-400 max-w-md">
				Tentukan berapa banyak pose yang ingin kamu ambil dalam 1 strip
			</p>

			<div class="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full">
				{#each DEFAULT_SLOT_OPTIONS as opt}
					<button
						type="button"
						onclick={() => handleSelectSlotCount(opt.slotCount)}
						class="group relative flex flex-col items-center justify-between rounded-3xl p-5 border border-zinc-800 bg-zinc-900/80 text-center transition-all duration-300 hover:border-rose-500 hover:bg-zinc-800/80 hover:scale-[1.02] hover:shadow-xl hover:shadow-rose-500/10 cursor-pointer"
					>
						<!-- Mini Thumbnail (Fixed height 135px so 4-strip NEVER overflows) -->
						<div class="my-3 flex items-center justify-center h-36 w-full overflow-hidden">
							<div
								class="relative flex flex-col items-center justify-between rounded-xl p-1.5 shadow-md border border-zinc-700/30 transition-transform group-hover:scale-105"
								style="background-color: #FFFFFF; height: 135px; width: auto; aspect-ratio: {opt.canvasWidth} / {opt.canvasHeight};"
							>
								<div class="flex flex-col gap-1 w-full flex-1 justify-around overflow-hidden">
									{#each Array(opt.slotCount) as _}
										<div class="w-full rounded-xs bg-zinc-700/40 border border-zinc-600/30" style="aspect-ratio: 4/3;"></div>
									{/each}
								</div>
								<div class="w-full text-center pt-1 pb-0.5">
									<div class="text-[4px] font-black text-zinc-900 tracking-wider uppercase">
										CHEKIYUUME
									</div>
								</div>
							</div>
						</div>

						<div class="w-full mt-2">
							<div class="inline-block rounded-full bg-zinc-800 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-400 border border-zinc-700/50 mb-2">
								{opt.slotCount} Slot Foto • {opt.aspectRatioLabel}
							</div>
							<h3 class="text-base font-bold text-white font-display">
								{opt.title}
							</h3>
							<p class="text-xs text-zinc-400 mt-1 line-clamp-2">
								{opt.description}
							</p>
						</div>
					</button>
				{/each}
			</div>
		</div>

	{:else if step === 'theme-select'}
		<!-- Step 3B: Select Frame Theme for chosen slot count -->
		<div class="flex flex-col items-center max-w-6xl w-full text-center animate-in fade-in duration-300">
			<button
				type="button"
				onclick={() => (step = 'slot-select')}
				class="self-start flex items-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white mb-4 cursor-pointer"
			>
				<ArrowLeft class="h-4 w-4" />
				<span>Ubah Jumlah Strip</span>
			</button>

			<div class="flex items-center gap-2 text-rose-400 text-xs font-extrabold uppercase tracking-wider mb-1">
				<Palette class="h-4 w-4" />
				<span>Langkah 2: Pilih Desain & Warna Frame</span>
			</div>
			<h2 class="text-3xl sm:text-4xl font-black text-white font-display">
				Pilih Tema Frame ({selectedSlotCount} Slot)
			</h2>
			<p class="mt-2 text-xs text-zinc-400 max-w-md">
				Pilih nuansa warna frame yang kamu sukai untuk menghiasi hasil cetak fotomu
			</p>

			<div class="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
				{#each availableThemesForSlot as theme}
					{@const isSelected = theme.id === selectedLayout.id}
					<button
						type="button"
						onclick={() => handleSelectTheme(theme)}
						class="group relative flex flex-col items-center justify-between rounded-3xl p-5 border text-center transition-all duration-300 cursor-pointer {isSelected ? 'bg-zinc-800/90 border-rose-500 ring-2 ring-rose-500/50 shadow-xl shadow-rose-500/10' : 'bg-zinc-900/80 border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700'}"
					>
						<!-- Mini Frame Preview with Theme Background Color -->
						<div class="my-3 flex items-center justify-center h-36 w-full overflow-hidden">
							<div
								class="relative flex flex-col items-center justify-between rounded-xl p-1.5 shadow-md border border-zinc-700/30 transition-transform group-hover:scale-105"
								style="background-color: {theme.backgroundColor}; height: 135px; width: auto; aspect-ratio: {theme.canvasWidth} / {theme.canvasHeight};"
							>
								<div class="flex flex-col gap-1 w-full flex-1 justify-around overflow-hidden">
									{#each theme.slots as _}
										<div class="w-full rounded-xs bg-zinc-700/40 border border-zinc-600/30" style="aspect-ratio: 4/3;"></div>
									{/each}
								</div>
								<div class="w-full text-center pt-1 pb-0.5">
									<div class="text-[4px] font-black tracking-wider uppercase {theme.backgroundColor === '#18181B' ? 'text-white' : 'text-zinc-900'}">
										CHEKIYUUME
									</div>
								</div>
							</div>
						</div>

						<div class="w-full mt-2">
							<div class="flex items-center justify-center gap-1.5 mb-1.5">
								<span class="h-3 w-3 rounded-full border border-white/30 shadow-xs" style="background-color: {theme.backgroundColor};"></span>
								<span class="text-[10px] font-extrabold uppercase text-zinc-400">{theme.aspectRatioLabel}</span>
							</div>
							<h3 class="text-sm font-bold text-white font-display">
								{theme.name}
							</h3>
							<p class="text-[11px] text-zinc-400 mt-1 line-clamp-2">
								{theme.description}
							</p>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Guest Name Modal -->
	<GuestNameModal
		isOpen={isNameModalOpen}
		onConfirm={handleConfirmName}
	/>

	<!-- Admin PIN Modal -->
	{#if showAdminPinModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6 animate-in fade-in duration-200">
			<div class="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl text-center">
				<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 mb-5">
					<Shield class="h-7 w-7" />
				</div>

				<h3 class="text-2xl font-black text-white font-display">Akses Admin Kiosk</h3>
				<p class="text-xs text-zinc-400 mt-1">Masukkan PIN untuk membuka dashboard booth (Default: 1234)</p>

				<div class="mt-6">
					<input
						type="password"
						bind:value={adminPinInput}
						maxlength="6"
						placeholder="••••"
						class="w-full text-center tracking-[1em] text-3xl font-black rounded-2xl bg-zinc-800 border border-zinc-700 py-3 text-white focus:border-rose-500 focus:outline-hidden"
						onkeydown={(e) => e.key === 'Enter' && handleAdminPinSubmit()}
						autofocus
					/>
					{#if adminPinError}
						<p class="text-xs font-semibold text-rose-400 mt-2">{adminPinError}</p>
					{/if}
				</div>

				<div class="mt-6 flex gap-2">
					<button
						type="button"
						onclick={() => { showAdminPinModal = false; adminPinInput = ''; adminPinError = ''; }}
						class="w-1/2 rounded-xl bg-zinc-800 py-3 text-xs font-bold text-zinc-300 hover:bg-zinc-700 cursor-pointer"
					>
						Batal
					</button>
					<button
						type="button"
						onclick={handleAdminPinSubmit}
						class="w-1/2 rounded-xl bg-rose-500 py-3 text-xs font-bold text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20 cursor-pointer"
					>
						Masuk
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
