<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import { settingsStore } from '$lib/stores/settings';
	import { generateQrCodeDataUrl } from '$lib/services/cloudStorage';
	import { getSessionFromDB } from '$lib/services/db';
	import { renderPhotostripCanvas, exportPhotostrip, injectQrToReceiptPhotostrip } from '$lib/utils/canvasRenderer';
	import { getLayoutById } from '$lib/config/frameLayouts';
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
	let printCopies = $state(1);

	// ── Debug Panel & Error Catcher ──
	let showDebug = $state(false);
	let debugLogs = $state<string[]>([]);
	let debugTapCount = $state(0);
	let debugCopied = $state(false);
	let isRegeneratingReceipt = $state(false);
	let isPreparingPrintModal = $state(false);

	function loadAllDebugLogs() {
		try {
			const videoRaw = sessionStorage.getItem('chekiyuume_video_debug');
			const printRaw = sessionStorage.getItem('chekiyuume_print_debug');
			const vLogs: string[] = videoRaw ? JSON.parse(videoRaw) : [];
			const pLogs: string[] = printRaw ? JSON.parse(printRaw) : [];
			const combined = [
				...pLogs.map((l) => `[PRINT] ${l}`),
				...vLogs.map((l) => `[VIDEO] ${l}`)
			];
			debugLogs = combined.length > 0 ? combined : ['(No debug logs found)'];
		} catch {
			debugLogs = ['(Failed to read debug logs)'];
		}
	}

	function handleDebugTap() {
		debugTapCount++;
		if (debugTapCount >= 5) {
			debugTapCount = 0;
			loadAllDebugLogs();
			showDebug = !showDebug;
		}
	}

	async function forceRegenerateReceiptPrint() {
		isRegeneratingReceipt = true;
		try {
			console.log('[Result] Force regenerating receipt print canvas...');
			const basePublicUrl = settings.cloudPublicBaseUrl?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
			const shareTargetUrl = session.cloudShareUrl || `${basePublicUrl}/share/${session.sessionId}`;

			if (session.photos && session.photos.length > 0 && session.photos.some((p) => !!p.dataUrl)) {
				const layout = getLayoutById(session.layoutId || 'thematic-receipt-classic');
				const printCanvas = await renderPhotostripCanvas({
					layout,
					photos: session.photos,
					slotPhotoIds: session.assignedSlotPhotoIds || [],
					stickers: session.stickers || [],
					guestName: session.guestName,
					sessionId: session.sessionId,
					brandingTitle: settings.kioskTitle || 'CHEKIYUUME',
					brandingSubtitle: settings.kioskSubtitle || 'PHOTOBOOTH STUDIO',
					shareUrl: shareTargetUrl,
					isForPrint: true
				});
				const printExport = exportPhotostrip(printCanvas);
				const pBlob = await printExport.blob;
				sessionStore.setPhotostrip(
					session.photostripDataUrl || printExport.dataUrl,
					session.photostripBlob || pBlob,
					printExport.dataUrl,
					pBlob
				);
			} else if (session.photostripDataUrl) {
				const withQr = await injectQrToReceiptPhotostrip(
					session.photostripDataUrl,
					session.sessionId,
					shareTargetUrl
				);
				if (withQr && withQr !== session.photostripDataUrl) {
					sessionStore.setPhotostrip(
						session.photostripDataUrl,
						session.photostripBlob || new Blob(),
						withQr
					);
				}
			}
			sessionStore.finalizeAndSaveSession();
			loadAllDebugLogs();
			alert('Berhasil meregenerasi photostrip struk dengan QR Code!');
		} catch (err: any) {
			console.error('[Result] Force regen error:', err);
			alert('Gagal meregenerasi: ' + String(err?.message || err));
		} finally {
			isRegeneratingReceipt = false;
		}
	}

	async function handleOpenPrintModal() {
		const isThematic = session.mode === 'thematic' || session.layoutId?.startsWith('thematic-receipt');
		if (isThematic) {
			isPreparingPrintModal = true;
			try {
				const needsRegen = !session.printPhotostripDataUrl || session.printPhotostripDataUrl === session.photostripDataUrl;
				if (needsRegen) {
					console.log('[Result] Ensuring fresh receipt print canvas with QR before opening print dialog...');
					const basePublicUrl = settings.cloudPublicBaseUrl?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
					const shareTargetUrl = session.cloudShareUrl || `${basePublicUrl}/share/${session.sessionId}`;

					if (session.photos && session.photos.length > 0 && session.photos.some((p) => !!p.dataUrl)) {
						const layout = getLayoutById(session.layoutId || 'thematic-receipt-classic');
						const printCanvas = await renderPhotostripCanvas({
							layout,
							photos: session.photos,
							slotPhotoIds: session.assignedSlotPhotoIds || [],
							stickers: session.stickers || [],
							guestName: session.guestName,
							sessionId: session.sessionId,
							brandingTitle: settings.kioskTitle || 'CHEKIYUUME',
							brandingSubtitle: settings.kioskSubtitle || 'PHOTOBOOTH STUDIO',
							shareUrl: shareTargetUrl,
							isForPrint: true
						});
						const printExport = exportPhotostrip(printCanvas);
						const pBlob = await printExport.blob;
						sessionStore.setPhotostrip(
							session.photostripDataUrl || printExport.dataUrl,
							session.photostripBlob || pBlob,
							printExport.dataUrl,
							pBlob
						);
					} else if (session.photostripDataUrl) {
						const withQr = await injectQrToReceiptPhotostrip(
							session.photostripDataUrl,
							session.sessionId,
							shareTargetUrl
						);
						if (withQr && withQr !== session.photostripDataUrl) {
							sessionStore.setPhotostrip(
								session.photostripDataUrl,
								session.photostripBlob || new Blob(),
								withQr
							);
						}
					}
				}
			} catch (err) {
				console.error('[Result] handleOpenPrintModal error:', err);
			} finally {
				isPreparingPrintModal = false;
			}
		}
		isPrintModalOpen = true;
	}

	async function copyDebugLogs() {
		try {
			await navigator.clipboard.writeText(debugLogs.join('\n'));
			debugCopied = true;
			setTimeout(() => (debugCopied = false), 2000);
		} catch {
			// Fallback for devices without clipboard API
			const el = document.createElement('textarea');
			el.value = debugLogs.join('\n');
			document.body.appendChild(el);
			el.select();
			document.execCommand('copy');
			document.body.removeChild(el);
			debugCopied = true;
			setTimeout(() => (debugCopied = false), 2000);
		}
	}

	onMount(async () => {
		const currentSession = sessionStore.hydrate();
		if (!currentSession.sessionId) {
			goto('/');
			return;
		}

		if (!currentSession.photostripDataUrl && !currentSession.videostripUrl) {
			try {
				const fromDB = await getSessionFromDB(currentSession.sessionId);
				if (fromDB && (fromDB.photostripDataUrl || fromDB.videostripUrl)) {
					if (fromDB.photostripDataUrl) {
						sessionStore.setPhotostrip(
							fromDB.photostripDataUrl,
							fromDB.photostripBlob || new Blob(),
							fromDB.printPhotostripDataUrl || fromDB.photostripDataUrl,
							fromDB.printPhotostripBlob || fromDB.photostripBlob || new Blob()
						);
					}
					if (fromDB.videostripBlob && fromDB.videostripUrl) {
						sessionStore.setVideostrip(fromDB.videostripBlob, fromDB.videostripUrl);
					}
				}
			} catch (e) {
				console.warn('[Result] Could not fetch session from IndexedDB:', e);
			}
		}

		// Self-healing: If thematic receipt has no distinct print version with QR, generate it on the fly
		if (
			currentSession.layoutId?.startsWith('thematic-receipt') &&
			(!currentSession.printPhotostripDataUrl || currentSession.printPhotostripDataUrl === currentSession.photostripDataUrl)
		) {
			try {
				const fromDB = await getSessionFromDB(currentSession.sessionId);
				if (fromDB?.printPhotostripDataUrl && fromDB.printPhotostripDataUrl !== fromDB.photostripDataUrl) {
					sessionStore.setPhotostrip(
						currentSession.photostripDataUrl || fromDB.photostripDataUrl || '',
						currentSession.photostripBlob || fromDB.photostripBlob || new Blob(),
						fromDB.printPhotostripDataUrl,
						fromDB.printPhotostripBlob || new Blob()
					);
				} else if (currentSession.photos && currentSession.photos.length > 0) {
					const layout = getLayoutById(currentSession.layoutId);
					const basePublicUrl = settings.cloudPublicBaseUrl?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
					const shareTargetUrl = `${basePublicUrl}/share/${currentSession.sessionId}`;
					const printCanvas = await renderPhotostripCanvas({
						layout,
						photos: currentSession.photos,
						slotPhotoIds: currentSession.assignedSlotPhotoIds || [],
						stickers: currentSession.stickers || [],
						guestName: currentSession.guestName,
						sessionId: currentSession.sessionId,
						brandingTitle: settings.kioskTitle || 'CHEKIYUUME',
						brandingSubtitle: settings.kioskSubtitle || 'PHOTOBOOTH STUDIO',
						shareUrl: shareTargetUrl,
						isForPrint: true
					});
					const printExport = exportPhotostrip(printCanvas);
					const pBlob = await printExport.blob;
					sessionStore.setPhotostrip(
						currentSession.photostripDataUrl || printExport.dataUrl,
						currentSession.photostripBlob || pBlob,
						printExport.dataUrl,
						pBlob
					);
				}
			} catch (err) {
				console.warn('[Result] Could not ensure receipt print photostrip:', err);
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
	import { saveOrShareFile } from '$lib/services/fileSaver';

	let isSavingMedia = $state(false);

	async function handleDownloadPhoto() {
		if (!session.photostripDataUrl && !session.photostripBlob) return;
		isSavingMedia = true;
		try {
			const content = session.photostripBlob || session.photostripDataUrl!;
			await saveOrShareFile(content, `ChekiYuume_${session.sessionId}_photo.png`, 'image/png', 'Simpan Foto');
		} finally {
			isSavingMedia = false;
		}
	}

	async function handleDownloadVideo() {
		const videoContent = session.videostripBlob || session.videostripUrl;
		if (!videoContent) return;
		isSavingMedia = true;
		try {
			await saveOrShareFile(videoContent, `ChekiYuume_${session.sessionId}_video.mp4`, 'video/mp4', 'Simpan Video');
		} finally {
			isSavingMedia = false;
		}
	}

	async function handleDownloadZip() {
		isSavingMedia = true;
		try {
			const zipBlob = await createSessionExportZip(session);
			await saveOrShareFile(zipBlob, `ChekiYuume_${session.sessionId}_complete.zip`, 'application/zip', 'Simpan Semua Berkas');
		} catch (err) {
			console.error('Failed to create ZIP bundle:', err);
		} finally {
			isSavingMedia = false;
		}
	}

	function handleConfirmPrint(copies: number) {
		printCopies = copies;
		isPrintModalOpen = false;
		// Logic for triggering print would go here
	}
</script>

<div class="flex flex-col h-full w-full max-w-7xl mx-auto p-2 sm:p-4 lg:p-6 overflow-hidden select-none gap-2 sm:gap-3">
	<!-- Top Bar -->
	<div class="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 rounded-xl sm:rounded-2xl px-3 py-1.5 sm:px-4 sm:py-2.5 shadow-xl shrink-0">
		<div class="flex items-center gap-2 sm:gap-3">
			<div class="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
				<CheckCircle2 class="h-4 w-4 sm:h-5 sm:w-5" />
			</div>
			<div>
				<h1 class="text-xs sm:text-base font-black text-white font-display leading-tight">Sesi Foto Selesai!</h1>
				<div class="flex items-center gap-1.5">
					<button
						type="button"
						class="text-left text-[9px] sm:text-xs text-zinc-400 leading-tight cursor-pointer select-none bg-transparent border-none p-0"
						onclick={handleDebugTap}
					>
						Tamu: <strong class="text-rose-400">{session.guestName || 'Tamu'}</strong> [{session.sessionId.slice(-6)}]
						{#if debugTapCount > 0 && debugTapCount < 5}
							<span class="text-zinc-600 text-[8px]">({debugTapCount}/5)</span>
						{/if}
					</button>
					<button
						type="button"
						onclick={() => {
							loadAllDebugLogs();
							showDebug = true;
						}}
						class="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700/80 cursor-pointer transition-colors"
						title="Buka Log Diagnostik & Error Catcher"
					>
						🐛 Debug
					</button>
				</div>
			</div>
		</div>

		<!-- Auto-Reset Indicator & Finish Button -->
		<div class="flex items-center gap-2 sm:gap-3">
			<div class="flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-zinc-800/80 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-zinc-400 border border-zinc-700/50">
				<RotateCcw class="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin-slow text-amber-400" />
				<span>Reset: <strong class="text-white">{remainingResetSeconds}s</strong></span>
			</div>

			<button
				type="button"
				onclick={handleFinishSession}
				class="flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl bg-rose-500 hover:bg-rose-600 px-3 py-1 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-bold text-white shadow-md active:scale-95 cursor-pointer"
			>
				<span>Selesai & Sesi Baru</span>
			</button>
		</div>
	</div>

	<!-- Main Content: Side-by-Side with Fluid Scaling -->
	<div class="flex flex-row gap-2.5 sm:gap-5 lg:gap-6 flex-1 min-h-0 overflow-hidden">
		<!-- Left: Media Preview Strip -->
		<div class="flex-1 flex flex-col items-center justify-center bg-zinc-900/70 border border-zinc-800 rounded-2xl sm:rounded-3xl p-2.5 sm:p-4 shadow-2xl min-h-0 overflow-hidden">
			<!-- Preview Tab Selector -->
			<div class="flex items-center gap-1 sm:gap-1.5 bg-zinc-800/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-zinc-700/50 mb-1.5 sm:mb-3 shrink-0">
				<button
					type="button"
					onclick={() => (activePreviewTab = 'photo')}
					class="flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-3 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold transition-all cursor-pointer {activePreviewTab === 'photo' ? 'bg-rose-500 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}"
				>
					<ImageIcon class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
					<span>Foto (2D)</span>
				</button>
				<button
					type="button"
					onclick={() => (activePreviewTab = 'video')}
					class="flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-3 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold transition-all cursor-pointer {activePreviewTab === 'video' ? 'bg-rose-500 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}"
				>
					<Film class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
					<span>Video (MP4)</span>
				</button>
			</div>

			<!-- Media Container -->
			<div class="flex items-center justify-center flex-1 w-full min-h-0 overflow-hidden p-0.5 sm:p-1">
				{#if activePreviewTab === 'photo'}
					{#if session.photostripDataUrl}
						<img
							src={session.photostripDataUrl}
							alt="Photostrip Final"
							class="max-h-full max-w-full h-auto w-auto rounded-xs shadow-2xl border border-zinc-700/50 object-contain animate-in fade-in duration-200"
						/>
					{:else}
						<div class="text-zinc-500 text-xs">Menyiapkan foto...</div>
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
							class="max-h-full max-w-full h-auto w-auto rounded-xs shadow-2xl border border-zinc-700/50 object-contain animate-in fade-in duration-200 bg-black"
						></video>
					{:else}
						<div class="text-zinc-500 text-xs">Memproses video...</div>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Right: QR Code & Action Panel -->
		<div class="w-[180px] sm:w-[260px] lg:w-[320px] shrink-0 flex flex-col justify-between bg-zinc-900/85 border border-zinc-800 rounded-2xl sm:rounded-3xl p-2.5 sm:p-4 lg:p-5 shadow-2xl min-h-0 overflow-y-auto gap-2 sm:gap-3 backdrop-blur-md">
			<!-- QR Scan Section -->
			<div class="flex flex-col items-center text-center bg-zinc-950/80 rounded-xl sm:rounded-2xl p-2 sm:p-3 border border-zinc-800 shrink-0">
				<div class="flex items-center gap-1 sm:gap-1.5 text-rose-400 text-[9px] sm:text-xs font-extrabold uppercase mb-1 sm:mb-2">
					<QrCode class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
					<span>Scan QR ke HP</span>
				</div>

				{#if qrCodeDataUrl}
					<div class="bg-white p-1.5 sm:p-2 rounded-lg sm:rounded-xl shadow-lg border-2 border-white inline-block">
						<img src={qrCodeDataUrl} alt="QR Code Share" class="h-20 w-20 sm:h-28 sm:w-28 lg:h-36 lg:w-36 object-contain" />
					</div>
				{:else}
					<div class="h-20 w-20 sm:h-28 sm:w-28 lg:h-36 lg:w-36 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs">
						Membuat QR...
					</div>
				{/if}
			</div>

			<!-- Action Buttons -->
			<div class="flex flex-col gap-1 sm:gap-1.5 shrink-0">
				<!-- Print Button -->
				<button
					type="button"
					onclick={handleOpenPrintModal}
					disabled={isPreparingPrintModal}
					class="w-full flex items-center justify-center gap-1.5 rounded-lg sm:rounded-xl bg-gradient-to-r from-indigo-500 to-rose-500 py-1.5 sm:py-2 px-2 sm:px-3 text-[11px] sm:text-xs font-black text-white shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
				>
					<Printer class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
					<span>{isPreparingPrintModal ? 'Menyiapkan QR Struk...' : 'Cetak Foto Fisik'}</span>
				</button>

				<!-- Download Photo -->
				<button
					type="button"
					onclick={handleDownloadPhoto}
					class="w-full flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl bg-zinc-800 hover:bg-zinc-700 py-1 sm:py-1.5 px-2 text-[10px] sm:text-[11px] font-bold text-zinc-200 border border-zinc-700 active:scale-95 cursor-pointer"
				>
					<Download class="h-3 w-3" />
					<span>Unduh Foto (PNG)</span>
				</button>

				<!-- Download Video BTS -->
				{#if session.videostripUrl}
					<button
						type="button"
						onclick={handleDownloadVideo}
						class="w-full flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl bg-zinc-800 hover:bg-zinc-700 py-1 sm:py-1.5 px-2 text-[10px] sm:text-[11px] font-bold text-zinc-200 border border-zinc-700 active:scale-95 cursor-pointer"
					>
						<Film class="h-3 w-3 text-indigo-400" />
						<span>Unduh Video BTS</span>
					</button>
				{/if}

				<!-- Download Full Session ZIP -->
				<button
					type="button"
					onclick={handleDownloadZip}
					class="w-full flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 py-1 sm:py-1.5 px-2 text-[10px] sm:text-[11px] font-bold text-rose-300 hover:text-white active:scale-95 cursor-pointer transition-colors"
				>
					<Download class="h-3 w-3 text-rose-400" />
					<span>Unduh Semua (.ZIP)</span>
				</button>
			</div>
		</div>
	</div>
</div>

<!-- Debug Log Panel & Error Catcher -->
{#if showDebug}
	<div class="fixed inset-0 z-50 flex items-end justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
		<div class="w-full max-w-2xl bg-zinc-950 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
				<div>
					<p class="text-white font-bold text-sm flex items-center gap-2">
						<span>🐛 Diagnostik & Error Catcher</span>
						<span class="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
							{session.mode} | {session.layoutId}
						</span>
					</p>
					<p class="text-zinc-500 text-[10px] mt-0.5">Log proses render foto, compile video & struk QR</p>
				</div>
				<div class="flex items-center gap-2">
					{#if session.mode === 'thematic' || session.layoutId?.startsWith('thematic-receipt')}
						<button
							type="button"
							onclick={forceRegenerateReceiptPrint}
							disabled={isRegeneratingReceipt}
							class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
						>
							{isRegeneratingReceipt ? 'Memproses...' : '🔄 Paksa QR Struk'}
						</button>
					{/if}
					<button
						type="button"
						onclick={copyDebugLogs}
						class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer"
					>
						{debugCopied ? '✓ Disalin!' : '📋 Salin'}
					</button>
					<button
						type="button"
						onclick={() => (showDebug = false)}
						class="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold cursor-pointer"
					>
						✕ Tutup
					</button>
				</div>
			</div>
			<!-- Diagnostic Status Badges -->
			<div class="px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-[10px] text-zinc-400 flex flex-wrap gap-2 items-center">
				<span class="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
					Print Strip: <strong class={session.printPhotostripDataUrl ? 'text-emerald-400' : 'text-rose-400'}>{session.printPhotostripDataUrl ? 'Tersedia' : 'Kosong'}</strong>
				</span>
				<span class="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
					Panjang Print: <strong>{session.printPhotostripDataUrl?.length ?? 0} char</strong>
				</span>
				<span class="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
					Sama dgn Digital: <strong class={session.printPhotostripDataUrl === session.photostripDataUrl ? 'text-amber-400' : 'text-emerald-400'}>{session.printPhotostripDataUrl === session.photostripDataUrl ? 'Ya (Potensi Barcode)' : 'Tidak (Unik/QR)'}</strong>
				</span>
			</div>
			<!-- Log Lines -->
			<div class="overflow-y-auto flex-1 p-3 font-mono text-[10px] leading-relaxed space-y-0.5">
				{#if debugLogs.length === 0}
					<p class="text-zinc-500">Tidak ada log tersedia. Coba lakukan sesi foto terlebih dahulu.</p>
				{:else}
					{#each debugLogs as line}
						<div
							class="px-2 py-0.5 rounded {line.includes('ERROR') || line.includes('CRITICAL') || line.includes('failed') ? 'text-red-400 bg-red-950/30' : line.includes('success') || line.includes('SUCCESS') || line.includes('OK') ? 'text-emerald-400 bg-emerald-950/20' : 'text-zinc-300'}"
						>
							{line}
						</div>
					{/each}
				{/if}
			</div>
			<!-- Session Info -->
			<div class="px-4 py-2 border-t border-zinc-800 shrink-0 text-[9px] text-zinc-500">
				Session: {session.sessionId} · Photos: {session.photos?.length ?? 0} · 
				hasVideoUrl: {!!session.videostripUrl} · Layout: {session.layoutId}
			</div>
		</div>
	</div>
{/if}

<!-- Physical Print Confirmation Modal -->
{#if session.photostripDataUrl}
	<PrintModal
		isOpen={isPrintModalOpen}
		photostripDataUrl={session.printPhotostripDataUrl || session.photostripDataUrl}
		sessionId={session.sessionId}
		shareUrl={session.cloudShareUrl || ''}
		onClose={() => (isPrintModalOpen = false)}
	/>
{/if}
