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

	function handleStartSession() {
		isNameModalOpen = true;
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

<div class="relative flex h-full w-full flex-col items-center justify-between p-4 sm:p-6 lg:p-8 overflow-hidden select-none">
	<!-- Background Ambient Glow -->
	<div class="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-rose-500/15 blur-3xl pointer-events-none"></div>
	<div class="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none"></div>

	<!-- Top Right: Admin Button -->
	<div class="fixed top-3 right-3 sm:top-5 sm:right-5 z-40 transition-opacity duration-700 {isAdminButtonVisible ? 'opacity-100' : 'opacity-20 hover:opacity-100'}">
		<button
			type="button"
			onclick={() => (showAdminPinModal = true)}
			class="flex items-center gap-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/60 px-3.5 py-2 text-xs font-bold text-zinc-300 hover:text-white shadow-lg backdrop-blur-md transition-all active:scale-95 cursor-pointer"
			title="Buka Pengaturan Admin"
		>
			<Settings class="h-3.5 w-3.5 text-rose-400" />
			<span>Admin</span>
		</button>
	</div>

	{#if step === 'attract'}
		<!-- Screen 1: Attract / Tap to Start (Fluid: Phone Landscape, Tablet & PC) -->
		<div class="my-auto flex flex-col items-center justify-center w-full max-w-3xl text-center animate-in fade-in duration-300">
			<button
				type="button"
				onclick={handleStart}
				class="group flex flex-col items-center justify-center text-center cursor-pointer w-full active:scale-[0.98] transition-transform"
			>
				<div class="relative mb-2 sm:mb-4 lg:mb-6 flex h-12 w-12 sm:h-16 sm:w-16 lg:h-22 lg:w-22 items-center justify-center rounded-2xl sm:rounded-3xl lg:rounded-4xl bg-gradient-to-tr from-rose-500 to-indigo-600 shadow-xl lg:shadow-2xl shadow-rose-500/30 group-hover:scale-105 transition-transform">
					<Camera class="h-6 w-6 sm:h-8 sm:w-8 lg:h-11 lg:w-11 text-white" />
					<span class="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 flex h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 items-center justify-center rounded-full bg-amber-400 text-zinc-950 font-bold shadow-md">
						<Sparkles class="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4" />
					</span>
				</div>

				<h1 class="text-3xl sm:text-5xl lg:text-7xl font-black tracking-tight text-white font-display">
					{$settingsStore.kioskTitle || 'CHEKIYUUME'}
				</h1>
				<p class="mt-0.5 sm:mt-1.5 text-[10px] sm:text-sm lg:text-base font-bold tracking-widest text-rose-400 uppercase">
					{$settingsStore.kioskSubtitle || 'PHOTOBOOTH STUDIO'}
				</p>
				<p class="mt-1 sm:mt-2 text-[10px] sm:text-xs lg:text-sm text-zinc-400 max-w-lg leading-relaxed line-clamp-1 sm:line-clamp-2">
					Abadikan momen seru dengan foto beresolusi tinggi & video sequential BTS kekinian.
				</p>

				<div class="mt-3 sm:mt-6 lg:mt-8 flex items-center gap-2 sm:gap-3 rounded-full bg-rose-500 hover:bg-rose-600 px-6 sm:px-9 lg:px-12 py-2 sm:py-3 lg:py-4 shadow-xl lg:shadow-2xl shadow-rose-500/35 transition-all group-hover:scale-105">
					<span class="h-2 sm:h-2.5 w-2 sm:w-2.5 rounded-full bg-white animate-ping"></span>
					<span class="text-xs sm:text-sm lg:text-base font-extrabold uppercase tracking-wider text-white">Sentuh Layar untuk Mulai</span>
					<ArrowRight class="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-white group-hover:translate-x-1.5 transition-transform" />
				</div>
			</button>
		</div>

	{:else if step === 'mode-select'}
		<!-- Screen 2: Mode Selection (Fluid: Phone Landscape, Tablet & PC) -->
		<div class="my-auto flex flex-col items-center justify-center w-full max-w-4xl animate-in fade-in duration-200 gap-2 sm:gap-4 lg:gap-6">
			<!-- Header -->
			<div class="flex items-center justify-between w-full shrink-0">
				<button
					type="button"
					onclick={() => (step = 'attract')}
					class="flex items-center gap-1.5 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-bold text-zinc-400 hover:text-white active:scale-95 cursor-pointer shadow-md"
				>
					<ArrowLeft class="h-3.5 w-3.5" />
					<span>Kembali</span>
				</button>
				<div class="text-center">
					<h2 class="text-base sm:text-xl lg:text-2xl font-black text-white font-display">Pilih Mode Photobooth</h2>
					<p class="text-[10px] sm:text-xs text-zinc-400">Pilih alur preset cepat atau eksplorasi kreatif 8 pose</p>
				</div>
				<div class="w-16"></div>
			</div>

			<!-- 2 Mode Cards: Side-by-Side -->
			<div class="grid grid-cols-2 gap-3 sm:gap-6 lg:gap-8 w-full max-w-3xl justify-center items-stretch">
				<!-- Mode Default Card -->
				<button
					type="button"
					onclick={() => chooseMode('default')}
					class="group flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800/90 p-3.5 sm:p-5 lg:p-7 text-center transition-all hover:border-rose-500/60 hover:scale-[1.02] active:scale-[0.98] shadow-xl lg:shadow-2xl cursor-pointer min-h-[190px] sm:min-h-[250px] lg:min-h-[290px] max-h-[min(70vh,380px)]"
				>
					<div class="flex flex-col items-center">
						<div class="flex h-9 w-9 sm:h-12 sm:w-12 lg:h-16 lg:w-16 items-center justify-center rounded-xl sm:rounded-2xl lg:rounded-3xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-1.5 sm:mb-3 group-hover:scale-110 transition-transform shadow-md">
							<Zap class="h-4 w-4 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
						</div>
						<span class="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[8px] sm:text-[9px] lg:text-[11px] font-extrabold uppercase tracking-wider text-rose-300 border border-rose-500/30 mb-1 sm:mb-2">
							Rekomendasi Cepat
						</span>
						<h3 class="text-xs sm:text-base lg:text-2xl font-black text-white font-display">Mode Default (Preset)</h3>
						<p class="mt-1 text-[9px] sm:text-xs lg:text-sm text-zinc-400 leading-relaxed max-w-xs line-clamp-2 sm:line-clamp-3">
							Pilih 1–4 slot foto, lalu foto otomatis langsung terisi ke dalam frame saat berpose.
						</p>
					</div>

					<div class="mt-2 sm:mt-4 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl bg-zinc-800 group-hover:bg-rose-500 py-1.5 sm:py-2.5 lg:py-3 px-3 sm:px-4 text-[10px] sm:text-xs lg:text-sm font-bold text-white transition-colors shadow-lg">
						<span>Pilih Default</span>
						<ArrowRight class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
					</div>
				</button>

				<!-- Mode Creative Card -->
				<button
					type="button"
					onclick={() => chooseMode('creative')}
					class="group flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800/90 p-3.5 sm:p-5 lg:p-7 text-center transition-all hover:border-indigo-500/60 hover:scale-[1.02] active:scale-[0.98] shadow-xl lg:shadow-2xl cursor-pointer min-h-[190px] sm:min-h-[250px] lg:min-h-[290px] max-h-[min(70vh,380px)]"
				>
					<div class="flex flex-col items-center">
						<div class="flex h-9 w-9 sm:h-12 sm:w-12 lg:h-16 lg:w-16 items-center justify-center rounded-xl sm:rounded-2xl lg:rounded-3xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-1.5 sm:mb-3 group-hover:scale-110 transition-transform shadow-md">
							<Sparkles class="h-4 w-4 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
						</div>
						<span class="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[8px] sm:text-[9px] lg:text-[11px] font-extrabold uppercase tracking-wider text-indigo-300 border border-indigo-500/30 mb-1 sm:mb-2">
							Bebas Berkreasi
						</span>
						<h3 class="text-xs sm:text-base lg:text-2xl font-black text-white font-display">Mode Creative (8 Pose)</h3>
						<p class="mt-1 text-[9px] sm:text-xs lg:text-sm text-zinc-400 leading-relaxed max-w-xs line-clamp-2 sm:line-clamp-3">
							Ambil 8 foto sepuasnya, lalu pilih frame aesthetic dan atur tata letak fotomu bebas.
						</p>
					</div>

					<div class="mt-2 sm:mt-4 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl bg-zinc-800 group-hover:bg-indigo-500 py-1.5 sm:py-2.5 lg:py-3 px-3 sm:px-4 text-[10px] sm:text-xs lg:text-sm font-bold text-white transition-colors shadow-lg">
						<span>Pilih Creative</span>
						<ArrowRight class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
					</div>
				</button>
			</div>
		</div>

	{:else if step === 'slot-select'}
		<!-- Step 3A: Select Slot Count -->
		<div class="my-auto flex flex-col items-center justify-center w-full max-w-5xl animate-in fade-in duration-200 gap-2 sm:gap-4">
			<!-- Header -->
			<div class="flex items-center justify-between w-full shrink-0">
				<button
					type="button"
					onclick={() => (step = 'mode-select')}
					class="flex items-center gap-1.5 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white active:scale-95 cursor-pointer"
				>
					<ArrowLeft class="h-3.5 w-3.5" />
					<span>Kembali</span>
				</button>
				<div class="text-center">
					<h2 class="text-sm sm:text-xl lg:text-2xl font-black text-white font-display">Pilih Format Frame Foto</h2>
					<p class="text-[9px] sm:text-xs text-zinc-400">Tentukan berapa banyak pose dalam 1 photostrip</p>
				</div>
				<div class="w-16"></div>
			</div>

			<!-- 4 Slot Cards: Compact on Phone, Grand on PC -->
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 w-full max-w-4xl justify-center items-stretch">
				{#each DEFAULT_SLOT_OPTIONS as opt}
					<button
						type="button"
						onclick={() => handleSelectSlotCount(opt.slotCount)}
						class="group flex flex-col items-center justify-between rounded-2xl p-2.5 sm:p-4 border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800/90 text-center transition-all hover:border-rose-500 hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg min-h-[170px] sm:min-h-[220px] lg:min-h-[260px] max-h-[min(68vh,320px)]"
					>
						<!-- Mini Thumbnail (Dynamically scaled to fit) -->
						<div class="flex items-center justify-center flex-1 w-full overflow-hidden my-0.5 sm:my-1">
							<div
								class="relative flex flex-col items-center justify-between rounded-lg p-0.5 sm:p-1 shadow-md border border-zinc-700/30 transition-transform group-hover:scale-105"
								style="background-color: #FFFFFF; height: min(75px, 20vh); width: auto; aspect-ratio: {opt.canvasWidth} / {opt.canvasHeight};"
							>
								<div class="flex flex-col gap-0.5 w-full flex-1 justify-around overflow-hidden">
									{#each Array(opt.slotCount) as _}
										<div class="w-full rounded-xs bg-zinc-700/40 border border-zinc-600/30" style="aspect-ratio: 4/3;"></div>
									{/each}
								</div>
							</div>
						</div>

						<div class="w-full mt-1 shrink-0">
							<span class="rounded-full bg-rose-500/20 px-2 py-0.5 text-[8px] sm:text-[9px] font-bold text-rose-300">
								{opt.aspectRatioLabel}
							</span>
							<h4 class="mt-0.5 text-[11px] sm:text-sm lg:text-base font-extrabold text-white font-display">
								{opt.title}
							</h4>
						</div>
					</button>
				{/each}
			</div>
		</div>

	{:else if step === 'theme-select'}
		<!-- Step 3B: Select Visual Frame Theme -->
		<div class="my-auto flex flex-col items-center justify-center w-full max-w-5xl animate-in fade-in duration-200 gap-2 sm:gap-4">
			<!-- Header -->
			<div class="flex items-center justify-between w-full shrink-0">
				<button
					type="button"
					onclick={() => (step = 'slot-select')}
					class="flex items-center gap-1.5 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white active:scale-95 cursor-pointer"
				>
					<ArrowLeft class="h-3.5 w-3.5" />
					<span>Kembali</span>
				</button>
				<div class="text-center">
					<h2 class="text-sm sm:text-xl lg:text-2xl font-black text-white font-display">Pilih Desain Tema Frame</h2>
					<p class="text-[9px] sm:text-xs text-zinc-400">Pilih warna atau template frame yang Anda sukai</p>
				</div>
				<div class="w-16"></div>
			</div>

			<!-- Frame Carousel -->
			<div class="flex items-center justify-start md:justify-center gap-2.5 sm:gap-4 w-full max-w-5xl overflow-x-auto py-1 px-4 scrollbar-none">
				{#each availableThemesForSlot as frame}
					{@const isSelected = selectedLayout.id === frame.id}
					<button
						type="button"
						onclick={() => handleSelectTheme(frame)}
						class="group flex flex-col items-center justify-between rounded-2xl p-2.5 sm:p-3.5 border transition-all cursor-pointer shadow-xl shrink-0 w-[140px] sm:w-[170px] lg:w-[190px] {isSelected ? 'border-rose-500 bg-zinc-800/90 ring-2 ring-rose-500/50 scale-102' : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-600'}"
						style="min-height: min(180px, 52vh); max-height: min(300px, 62vh);"
					>
						<!-- Photostrip Frame Preview (Strict WYSIWYG ratio, clean crisp corners) -->
						<div class="flex items-center justify-center flex-1 w-full overflow-hidden my-0.5 sm:my-1">
							<div
								class="relative rounded-xs shadow-md border border-zinc-700/60 transition-transform group-hover:scale-105 overflow-hidden"
								style="background-color: {frame.backgroundColor || '#FFFFFF'}; height: min(105px, 30vh); width: auto; aspect-ratio: {frame.canvasWidth} / {frame.canvasHeight};"
							>
								{#if frame.backgroundUrl}
									<img src={frame.backgroundUrl} alt="Frame" class="absolute inset-0 h-full w-full object-cover" />
								{/if}

								{#each frame.slots as slot, idx}
									{@const leftPct = (slot.x / frame.canvasWidth) * 100}
									{@const topPct = (slot.y / frame.canvasHeight) * 100}
									{@const widthPct = (slot.width / frame.canvasWidth) * 100}
									{@const heightPct = (slot.height / frame.canvasHeight) * 100}
									<div
										class="absolute bg-zinc-700/60 border border-zinc-600/40 rounded-xs flex items-center justify-center text-[6px] font-bold text-zinc-300"
										style="left: {leftPct}%; top: {topPct}%; width: {widthPct}%; height: {heightPct}%;"
									>
										{idx + 1}
									</div>
								{/each}

								{#if frame.overlayUrl}
									<img src={frame.overlayUrl} alt="Overlay" class="absolute inset-0 h-full w-full object-cover z-20" />
								{/if}
							</div>
						</div>

						<div class="w-full text-center mt-1 shrink-0">
							<h4 class="text-[11px] sm:text-xs lg:text-sm font-extrabold text-white font-display line-clamp-1">
								{frame.name}
							</h4>
							<span class="text-[8px] sm:text-[9px] text-zinc-400 uppercase font-semibold">
								{frame.aspectRatioLabel || `${frame.totalSlots} Pose`}
							</span>
						</div>
					</button>
				{/each}
			</div>

			<!-- Ready to Start CTA -->
			<div class="mt-1 sm:mt-2 shrink-0">
				<button
					type="button"
					onclick={handleStartSession}
					class="flex items-center gap-2 rounded-full bg-rose-500 hover:bg-rose-600 px-6 sm:px-10 py-2 sm:py-3 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white shadow-xl shadow-rose-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
				>
					<Camera class="h-4 w-4" />
					<span>Mulai Sesi Foto ({selectedLayout.name})</span>
					<ArrowRight class="h-4 w-4" />
				</button>
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
