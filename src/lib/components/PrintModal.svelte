<script lang="ts">
	import type { PrintOptions } from '$lib/types';
	import { executePrint } from '$lib/services/printEngine';
	import { sessionStore } from '$lib/stores/session';
	import { settingsStore } from '$lib/stores/settings';
	import {
		Printer,
		X,
		FileText,
		Layers,
		Sparkles,
		Scissors,
		Check,
		Maximize2,
		MoveHorizontal,
		MoveVertical,
		LayoutGrid,
		Leaf
	} from '@lucide/svelte';

	interface Props {
		isOpen: boolean;
		photostripDataUrl: string;
		onClose: () => void;
		onPrintSuccess?: () => void;
	}

	let { isOpen, photostripDataUrl, onClose, onPrintSuccess }: Props = $props();

	let isPrinting = $state(false);
	let aspectRatio = $state(0.3125); // Default 1:3 vertical photostrip ratio (1080/3456)
	let isPortraitStrip = $state(true);

	let printOptions = $state<PrintOptions>({
		paperSize: '4R',
		orientation: 'portrait',
		copies: 2,
		sizeMode: 'actual',
		alignment: 'top-left',
		selectedSlot: 3 // Slot 4 (index 3) default for eco-saving
	});

	// Preload image to detect exact aspect ratio and initialize smart defaults
	$effect(() => {
		if (isOpen && photostripDataUrl) {
			const img = new Image();
			img.src = photostripDataUrl;
			img.onload = () => {
				const ratio = img.naturalWidth / img.naturalHeight;
				aspectRatio = ratio;
				isPortraitStrip = ratio < 0.45;

				const defaultPaper = $settingsStore.defaultPaperSize || '4R';
				printOptions.paperSize = defaultPaper;

				if (isPortraitStrip) {
					printOptions.orientation = 'portrait';
					printOptions.copies = defaultPaper === '4R' ? 2 : 2;
					printOptions.sizeMode = 'actual';
					printOptions.alignment = 'top-left';
					printOptions.selectedSlot = 3; // Slot 4 default
				} else {
					printOptions.paperSize = '4R';
					printOptions.orientation = 'portrait';
					printOptions.copies = 1;
					printOptions.sizeMode = 'actual';
					printOptions.alignment = 'center';
					printOptions.selectedSlot = 0;
				}
			};
			img.onerror = () => {
				aspectRatio = 0.333;
				isPortraitStrip = true;
			};
		}
	});

	// Reactive clamping when copies or mode changes
	function setPaperSize(size: '4R' | 'A4') {
		printOptions.paperSize = size;
		if (size === '4R' && printOptions.copies === 4) {
			printOptions.copies = 2;
		}
		if (size === '4R' && printOptions.orientation === 'landscape') {
			printOptions.orientation = 'portrait';
		}
	}

	function setOrientation(orient: 'portrait' | 'landscape') {
		printOptions.orientation = orient;
		if (orient === 'landscape') {
			printOptions.sizeMode = 'actual';
			clampSelectedSlot(printOptions.copies);
		}
	}

	function setSizeMode(mode: 'actual' | 'fit') {
		if (printOptions.orientation === 'landscape') {
			printOptions.sizeMode = 'actual';
			return;
		}
		printOptions.sizeMode = mode;
	}

	function setCopies(cp: 1 | 2 | 4) {
		printOptions.copies = cp;
		clampSelectedSlot(cp);
	}

	function clampSelectedSlot(cp: number) {
		let maxSlot = 4 - cp;
		if (maxSlot < 0) maxSlot = 0;
		if ((printOptions.selectedSlot ?? 0) > maxSlot) {
			printOptions.selectedSlot = maxSlot;
		}
	}

	function selectSlotLane(index: number) {
		const numCopies = printOptions.copies;
		let target = index;
		if (numCopies === 2 && target > 2) target = 2;
		else if (numCopies === 4 && target > 0) target = 0;
		printOptions.selectedSlot = target;
	}

	async function handlePrint() {
		isPrinting = true;
		try {
			const success = await executePrint(photostripDataUrl, printOptions, isPortraitStrip);
			if (success) {
				sessionStore.incrementPrintCount();
				if (onPrintSuccess) onPrintSuccess();
			}
		} catch (err) {
			console.error('[PrintModal] Print execution error:', err);
		} finally {
			isPrinting = false;
			onClose();
		}
	}

	// Dynamic calculation for Portrait mode preview strip scale
	let portraitScalePercent = $derived.by(() => {
		const actualImgWidthMm = isPortraitStrip ? 50.8 : 101.6;
		const paperWidthMm = printOptions.paperSize === 'A4' ? 210 : 101.6;
		return Math.min((actualImgWidthMm / paperWidthMm) * 100, 92);
	});

	let isHorizontalEcoLayout = $derived(
		printOptions.paperSize === 'A4' &&
		printOptions.sizeMode === 'actual' &&
		printOptions.orientation === 'landscape'
	);
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200 select-none"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-4xl rounded-3xl bg-zinc-900/95 border border-zinc-800 p-5 sm:p-7 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-zinc-100 backdrop-blur-xl"
		>
			<!-- Header -->
			<div class="flex items-center justify-between pb-4 border-b border-zinc-800 shrink-0">
				<div class="flex items-center gap-3">
					<div
						class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-rose-500/20 text-indigo-400 border border-indigo-500/30 shadow-inner"
					>
						<Printer class="h-5 w-5 text-indigo-400" />
					</div>
					<div>
						<h2 class="text-xl sm:text-2xl font-black text-white font-display tracking-tight flex items-center gap-2">
							<span>Pengaturan Cetak Foto</span>
							{#if isHorizontalEcoLayout}
								<span
									class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
								>
									<Leaf class="h-3 w-3" /> Eco Mode
								</span>
							{/if}
						</h2>
						<p class="text-xs text-zinc-400">Pratinjau fisik kertas & tata letak cetak photostrip</p>
					</div>
				</div>
				<button
					type="button"
					onclick={onClose}
					class="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
					aria-label="Tutup"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Body: Side-by-Side WYSIWYG & Options Form -->
			<div class="grid grid-cols-1 md:grid-cols-12 gap-5 py-5 overflow-y-auto flex-1 items-stretch">
				<!-- Left Column: WYSIWYG Paper Sheet Preview (5 cols) -->
				<div
					class="md:col-span-5 flex flex-col items-center justify-between bg-zinc-950/80 rounded-2xl p-4 sm:p-5 border border-zinc-800/80 shadow-inner"
				>
					<div class="w-full flex items-center justify-between mb-2 shrink-0">
						<span class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
							<Layers class="h-3.5 w-3.5 text-indigo-400" />
							<span>Pratinjau Kertas ({printOptions.paperSize})</span>
						</span>
						{#if isHorizontalEcoLayout}
							<span class="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
								Pilih Slot 🟢
							</span>
						{/if}
					</div>

					<!-- Simulated Physical Paper Sheet -->
					<div class="w-full flex-1 flex items-center justify-center py-2 min-h-[280px]">
						<div
							class="relative bg-white shadow-2xl rounded-xs transition-all duration-300 border border-zinc-300 overflow-hidden flex"
							style="
								height: 270px;
								aspect-ratio: {printOptions.paperSize === 'A4' ? '210/297' : '101.6/152.4'};
							"
						>
							{#if isHorizontalEcoLayout}
								<!-- 4-Slot Eco Mode Matrix (A4 Landscape) -->
								{@const tops = ['6.73%', '27.95%', '49.16%', '70.37%']}
								{@const slotLabels = ['Slot 1 (Atas)', 'Slot 2', 'Slot 3', 'Slot 4 (Bawah)']}
								<div class="relative w-full h-full">
									{#each [0, 1, 2, 3] as slotIdx}
										{@const isActive =
											slotIdx >= (printOptions.selectedSlot ?? 0) &&
											slotIdx < (printOptions.selectedSlot ?? 0) + (printOptions.copies || 1)}
										<div
											class="absolute left-0 w-full flex items-center justify-center cursor-pointer transition-all duration-150 {isActive
												? 'bg-indigo-500/20 border-y border-indigo-500/60 shadow-inner'
												: 'border-b border-dashed border-zinc-300 hover:bg-zinc-100'}"
											style="top: {tops[slotIdx]}; height: 21.2%;"
											onclick={() => selectSlotLane(slotIdx)}
											role="button"
											tabindex="0"
											onkeydown={(e) => e.key === 'Enter' && selectSlotLane(slotIdx)}
										>
											{#if isActive}
												<!-- Rotated Strip Thumbnail inside Slot -->
												<div class="w-[74%] h-[90%] relative overflow-hidden flex items-center justify-center pointer-events-none">
													<img
														src={photostripDataUrl}
														alt="Rotated Strip"
														class="absolute top-1/2 left-1/2 object-contain shadow-xs border border-zinc-400/40"
														style="
															width: 100%;
															height: {(1 / (aspectRatio || 0.33)) * 100}%;
															transform: translate(-50%, -50%) rotate(90deg);
														"
													/>
												</div>
											{:else}
												<span class="text-[9px] font-semibold text-zinc-400 pointer-events-none select-none tracking-tight">
													{slotLabels[slotIdx]}
												</span>
											{/if}
										</div>
									{/each}
								</div>
							{:else if printOptions.sizeMode === 'fit'}
								<!-- Fit-to-Page Preview -->
								<div class="w-full h-full flex items-center justify-center p-2">
									<img
										src={photostripDataUrl}
										alt="Fit Preview"
										class="w-full h-full object-contain shadow-xs"
									/>
								</div>
							{:else}
								<!-- Standard Portrait / Multi-copies Preview -->
								<div
									class="w-full h-full flex flex-row gap-2 transition-all p-3 {printOptions.paperSize === 'A4' &&
									printOptions.alignment === 'top-left'
										? 'justify-start items-start'
										: 'justify-center items-center'}"
								>
									{#each Array(printOptions.copies || 1) as _, i}
										<img
											src={photostripDataUrl}
											alt="Strip Copy {i + 1}"
											class="object-contain shadow-xs border border-zinc-300 max-h-[90%] bg-white"
											style="width: {portraitScalePercent}%;"
										/>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<!-- Preview Helper Caption -->
					<div class="w-full mt-2 pt-2 border-t border-zinc-800/60 text-center shrink-0">
						<p class="text-[11px] text-zinc-400 leading-snug">
							{#if isHorizontalEcoLayout}
								<span class="text-indigo-300 font-semibold">
									🌿 Slot {(printOptions.selectedSlot ?? 0) + 1} dipilih.
								</span>
								Sisa area kertas A4 atas/bawah dapat disimpan dan dipakai lagi.
							{:else if printOptions.paperSize === '4R' && printOptions.copies === 2}
								<span class="text-rose-300 font-semibold">✨ Standar Booth:</span> 2 strip kembar 2"×6" berdampingan pas di 1 lembar 4R.
							{:else if printOptions.paperSize === 'A4' && printOptions.alignment === 'top-left'}
								<span class="text-amber-300 font-semibold">✂️ Pojok Kiri Atas:</span> Memudahkan pemotongan dan menyisakan kertas A4.
							{:else}
								<span class="text-zinc-300">{printOptions.copies}x Salinan ({printOptions.paperSize})</span>
							{/if}
						</p>
					</div>
				</div>

				<!-- Right Column: Interactive Settings Form (7 cols) -->
				<div class="md:col-span-7 flex flex-col gap-3.5 justify-start">
					<!-- 1. Paper Size -->
					<div>
						<div class="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
							1. Ukuran Kertas Printer
						</div>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								onclick={() => setPaperSize('4R')}
								class="flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold border transition-all cursor-pointer {printOptions.paperSize === '4R'
									? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-sm shadow-rose-500/10'
									: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80 hover:text-white'}"
							>
								<span>📸 Kertas 4R (4"×6")</span>
							</button>
							<button
								type="button"
								onclick={() => setPaperSize('A4')}
								class="flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold border transition-all cursor-pointer {printOptions.paperSize === 'A4'
									? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-sm shadow-rose-500/10'
									: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80 hover:text-white'}"
							>
								<span>📄 Kertas A4 Standar</span>
							</button>
						</div>
					</div>

					<!-- 2. Orientation (for vertical photostrips on A4) -->
					{#if isPortraitStrip && printOptions.paperSize === 'A4'}
						<div>
							<div class="flex items-center justify-between mb-1.5">
								<div class="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
									2. Orientasi Cetak (A4)
								</div>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<button
									type="button"
									onclick={() => setOrientation('portrait')}
									class="flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold border transition-all cursor-pointer {printOptions.orientation === 'portrait'
										? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
										: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'}"
								>
									<MoveVertical class="h-3.5 w-3.5" />
									<span>Tegak (Portrait)</span>
								</button>
								<button
									type="button"
									onclick={() => setOrientation('landscape')}
									class="flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold border transition-all cursor-pointer {printOptions.orientation === 'landscape'
										? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/10'
										: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'}"
								>
									<MoveHorizontal class="h-3.5 w-3.5" />
									<span>Mendatar (Eco 4-Slot)</span>
								</button>
							</div>
						</div>
					{/if}

					<!-- 3. Size Mode -->
					{#if printOptions.orientation === 'portrait'}
						<div>
							<div class="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
								3. Ukuran Cetak
							</div>
							<div class="grid grid-cols-2 gap-2">
								<button
									type="button"
									onclick={() => setSizeMode('actual')}
									class="flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer {printOptions.sizeMode === 'actual'
										? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
										: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'}"
								>
									<div class="text-xs font-bold flex items-center gap-1.5">
										<Scissors class="h-3.5 w-3.5" />
										<span>Ukuran Asli (Actual)</span>
									</div>
									<span class="text-[10px] text-zinc-400 mt-0.5">
										{isPortraitStrip ? '2" × 6" (5 × 15 cm)' : '4" × 6" (10 × 15 cm)'}
									</span>
								</button>

								<button
									type="button"
									onclick={() => setSizeMode('fit')}
									class="flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer {printOptions.sizeMode === 'fit'
										? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
										: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'}"
								>
									<div class="text-xs font-bold flex items-center gap-1.5">
										<Maximize2 class="h-3.5 w-3.5" />
										<span>Penuh Kertas (Fit)</span>
									</div>
									<span class="text-[10px] text-zinc-400 mt-0.5">Membesar ikuti lembar</span>
								</button>
							</div>
						</div>
					{/if}

					<!-- 4. Copies -->
					{#if printOptions.sizeMode !== 'fit'}
						<div>
							<div class="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
								4. Jumlah Salinan ({printOptions.copies}x Strip)
							</div>
							<div class="grid grid-cols-3 gap-2">
								<button
									type="button"
									onclick={() => setCopies(1)}
									class="rounded-xl py-2 text-xs font-bold border transition-all cursor-pointer {printOptions.copies === 1
										? 'bg-rose-500/20 border-rose-500 text-rose-300'
										: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'}"
								>
									1x Strip
								</button>
								<button
									type="button"
									onclick={() => setCopies(2)}
									class="rounded-xl py-2 text-xs font-bold border transition-all cursor-pointer {printOptions.copies === 2
										? 'bg-rose-500/20 border-rose-500 text-rose-300'
										: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'}"
								>
									2x (Standar)
								</button>
								<button
									type="button"
									onclick={() => setCopies(4)}
									disabled={printOptions.paperSize === '4R'}
									class="rounded-xl py-2 text-xs font-bold border transition-all cursor-pointer {printOptions.copies === 4
										? 'bg-rose-500/20 border-rose-500 text-rose-300'
										: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'} disabled:opacity-25 disabled:pointer-events-none"
								>
									4x (A4)
								</button>
							</div>
						</div>
					{/if}

					<!-- 5. A4 Landscape Slot Quick Pills (Eco Mode) -->
					{#if isHorizontalEcoLayout}
						<div>
							<div class="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
								5. Posisi Slot Cetak di Kertas A4
							</div>
							<div class="grid grid-cols-4 gap-1.5">
								{#each [0, 1, 2, 3] as slotNum}
									{@const isSelected = (printOptions.selectedSlot ?? 0) === slotNum}
									{@const isSlotDisabled =
										(printOptions.copies === 2 && slotNum > 2) ||
										(printOptions.copies === 4 && slotNum > 0)}
									<button
										type="button"
										onclick={() => selectSlotLane(slotNum)}
										disabled={isSlotDisabled}
										class="py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 {isSelected
											? 'bg-indigo-500/25 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20'
											: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'} disabled:opacity-25 disabled:pointer-events-none"
									>
										<span>Slot {slotNum + 1}</span>
										<span class="text-[9px] text-zinc-400 font-normal">
											{slotNum === 0 ? 'Atas' : slotNum === 3 ? 'Bawah' : 'Tengah'}
										</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- 6. Alignment (A4 Portrait only) -->
					{#if printOptions.paperSize === 'A4' && printOptions.sizeMode === 'actual' && printOptions.orientation === 'portrait'}
						<div>
							<div class="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
								5. Posisi Cetak di Kertas A4
							</div>
							<div class="grid grid-cols-2 gap-2">
								<button
									type="button"
									onclick={() => (printOptions.alignment = 'top-left')}
									class="rounded-xl py-2 px-3 text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 {printOptions.alignment === 'top-left'
										? 'bg-rose-500/20 border-rose-500 text-rose-300'
										: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'}"
								>
									<span>Pojok Kiri Atas (Hemat)</span>
								</button>
								<button
									type="button"
									onclick={() => (printOptions.alignment = 'center')}
									class="rounded-xl py-2 px-3 text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 {printOptions.alignment === 'center'
										? 'bg-rose-500/20 border-rose-500 text-rose-300'
										: 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700/80'}"
								>
									<span>Tengah (Center)</span>
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer Action Buttons -->
			<div class="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3 shrink-0">
				<button
					type="button"
					onclick={onClose}
					class="rounded-2xl bg-zinc-800 hover:bg-zinc-700 px-6 py-3 text-sm font-bold text-zinc-300 hover:text-white transition-colors cursor-pointer"
				>
					Batal
				</button>
				<button
					type="button"
					onclick={handlePrint}
					disabled={isPrinting}
					class="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-rose-500 hover:opacity-95 px-8 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
				>
					<Printer class="h-4 w-4" />
					<span>{isPrinting ? 'Menyiapkan Cetak...' : 'Lanjutkan Cetak'}</span>
				</button>
			</div>
		</div>
	</div>
{/if}

