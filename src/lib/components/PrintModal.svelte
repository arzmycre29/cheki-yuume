<script lang="ts">
	import type { PrintOptions } from '$lib/types';
	import { executePrint } from '$lib/services/printEngine';
	import { sessionStore } from '$lib/stores/session';
	import { Printer, X, FileText, Check, Layers, Sparkles } from '@lucide/svelte';

	interface Props {
		isOpen: boolean;
		photostripDataUrl: string;
		onClose: () => void;
		onPrintSuccess?: () => void;
	}

	let { isOpen, photostripDataUrl, onClose, onPrintSuccess }: Props = $props();

	let isPrinting = $state(false);

	let printOptions = $state<PrintOptions>({
		paperSize: '4R',
		orientation: 'portrait',
		copies: 2,
		sizeMode: 'actual',
		alignment: 'center',
		a4SlotLane: 4
	});

	async function handlePrint() {
		isPrinting = true;
		try {
			const success = await executePrint(photostripDataUrl, printOptions);
			if (success) {
				sessionStore.incrementPrintCount();
				if (onPrintSuccess) onPrintSuccess();
			}
		} catch (err) {
			console.error('Print failed:', err);
		} finally {
			isPrinting = false;
			onClose();
		}
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
		<div class="w-full max-w-4xl rounded-3xl bg-zinc-900 border border-zinc-800 p-6 sm:p-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
			<!-- Header -->
			<div class="flex items-center justify-between pb-4 border-b border-zinc-800 shrink-0">
				<div class="flex items-center gap-3">
					<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
						<Printer class="h-6 w-6" />
					</div>
					<div>
						<h2 class="text-2xl font-black text-white font-display">Pengaturan Cetak Foto</h2>
						<p class="text-xs text-zinc-400">Pilih jenis kertas dan tata letak cetak</p>
					</div>
				</div>
				<button
					type="button"
					onclick={onClose}
					class="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Body: Split Preview & Options -->
			<div class="grid grid-cols-1 md:grid-cols-12 gap-6 py-6 overflow-y-auto flex-1">
				<!-- Left: Paper Sheet Preview (5 cols) -->
				<div class="md:col-span-5 flex flex-col items-center justify-center bg-zinc-950/80 rounded-2xl p-4 border border-zinc-800/80">
					<span class="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
						Pratinjau Kertas: {printOptions.paperSize} ({printOptions.orientation})
					</span>

					<!-- Simulated Paper Sheet -->
					<div
						class="relative bg-white shadow-2xl rounded-sm flex items-center justify-center transition-all duration-300 p-2 overflow-hidden {printOptions.alignment === 'top-left' && printOptions.paperSize === 'A4' ? 'justify-start items-start p-4' : 'justify-center items-center'}"
						style="width: {printOptions.orientation === 'landscape' ? '240px' : '170px'}; aspect-ratio: {printOptions.paperSize === 'A4' ? (printOptions.orientation === 'landscape' ? '297/210' : '210/297') : (printOptions.orientation === 'landscape' ? '152/101' : '101/152')};"
					>
						<!-- Mini Strips Mockup -->
						<div class="flex items-center justify-center gap-2 h-full max-h-full">
							{#each Array(printOptions.copies) as _}
								<img
									src={photostripDataUrl}
									alt="Strip Preview"
									class="object-contain shadow-xs border border-zinc-300 {printOptions.sizeMode === 'actual' ? 'max-h-[85%]' : 'max-h-full'}"
								/>
							{/each}
						</div>
					</div>

					<p class="text-[11px] text-zinc-400 mt-4 text-center">
						{#if printOptions.copies === 2 && printOptions.paperSize === '4R'}
							✨ Standar Booth: 2 strip kembar berdampingan pas di 1 lembar 4R.
						{:else if printOptions.paperSize === 'A4'}
							📄 Kertas A4 hemat: {printOptions.copies}x strip per cetak.
						{/if}
					</p>
				</div>

				<!-- Right: Options Form (7 cols) -->
				<div class="md:col-span-7 flex flex-col gap-4">
					<!-- 1. Paper Size -->
					<div>
						<div class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">1. Ukuran Kertas</div>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								onclick={() => (printOptions.paperSize = '4R')}
								class="flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-bold border transition-all cursor-pointer {printOptions.paperSize === '4R' ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'}"
							>
								<span>📸 Kertas 4R (4"×6")</span>
							</button>
							<button
								type="button"
								onclick={() => (printOptions.paperSize = 'A4')}
								class="flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-bold border transition-all cursor-pointer {printOptions.paperSize === 'A4' ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'}"
							>
								<span>📄 Kertas A4 Standar</span>
							</button>
						</div>
					</div>

					<!-- 2. Orientation -->
					<div>
						<div class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">2. Orientasi Cetak</div>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								onclick={() => (printOptions.orientation = 'portrait')}
								class="flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold border transition-all cursor-pointer {printOptions.orientation === 'portrait' ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'}"
							>
								<span>Tegak (Portrait)</span>
							</button>
							<button
								type="button"
								onclick={() => (printOptions.orientation = 'landscape')}
								class="flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold border transition-all cursor-pointer {printOptions.orientation === 'landscape' ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'}"
							>
								<span>Mendatar (Landscape)</span>
							</button>
						</div>
					</div>

					<!-- 3. Copies -->
					<div>
						<div class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">3. Jumlah Salinan (Copies)</div>
						<div class="grid grid-cols-3 gap-2">
							<button
								type="button"
								onclick={() => (printOptions.copies = 1)}
								class="rounded-xl py-2.5 text-xs font-bold border transition-all cursor-pointer {printOptions.copies === 1 ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'}"
							>
								1x Strip
							</button>
							<button
								type="button"
								onclick={() => (printOptions.copies = 2)}
								class="rounded-xl py-2.5 text-xs font-bold border transition-all cursor-pointer {printOptions.copies === 2 ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'}"
							>
								2x (Default)
							</button>
							<button
								type="button"
								onclick={() => (printOptions.copies = 4)}
								disabled={printOptions.paperSize === '4R'}
								class="rounded-xl py-2.5 text-xs font-bold border transition-all cursor-pointer {printOptions.copies === 4 ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'} disabled:opacity-30 disabled:pointer-events-none"
							>
								4x Strip (A4)
							</button>
						</div>
					</div>

					<!-- 4. Alignment / Lane (A4 only) -->
					{#if printOptions.paperSize === 'A4'}
						<div>
							<div class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">4. Posisi di Kertas A4</div>
							<div class="grid grid-cols-2 gap-2">
								<button
									type="button"
									onclick={() => (printOptions.alignment = 'top-left')}
									class="rounded-xl py-2 px-3 text-xs font-semibold border transition-all cursor-pointer {printOptions.alignment === 'top-left' ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'}"
								>
									Pojok Kiri Atas (Hemat Kertas)
								</button>
								<button
									type="button"
									onclick={() => (printOptions.alignment = 'center')}
									class="rounded-xl py-2 px-3 text-xs font-semibold border transition-all cursor-pointer {printOptions.alignment === 'center' ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'}"
								>
									Tengah (Center)
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer Action -->
			<div class="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3 shrink-0">
				<button
					type="button"
					onclick={onClose}
					class="rounded-2xl bg-zinc-800 hover:bg-zinc-700 px-6 py-3.5 text-sm font-bold text-zinc-300 transition-colors cursor-pointer"
				>
					Batal
				</button>
				<button
					type="button"
					onclick={handlePrint}
					disabled={isPrinting}
					class="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-rose-500 hover:opacity-95 px-8 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 active:scale-95 transition-all cursor-pointer"
				>
					<Printer class="h-4 w-4" />
					<span>{isPrinting ? 'Menyiapkan Cetak...' : 'Lanjutkan Cetak'}</span>
				</button>
			</div>
		</div>
	</div>
{/if}
