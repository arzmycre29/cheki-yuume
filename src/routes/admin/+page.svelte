<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import { settingsStore } from '$lib/stores/settings';
	import { customFramesStore } from '$lib/stores/customFrames';
	import { cameraService, type VideoDeviceInfo } from '$lib/services/camera';
	import { uvcCameraService, type UvcCaptureResult } from '$lib/services/uvcCamera';
	import {
		getAllSessionsFromDB,
		deleteSessionFromDB,
		deleteMultipleSessionsFromDB,
		deleteAllSessionsFromDB,
		createSessionExportZip,
		createBatchSessionExportZip
	} from '$lib/services/db';
	import type { SessionData, KioskSettings, FrameLayout } from '$lib/types';
	import {
		uploadToCloudinary,
		uploadCustomFrameOverlayToCloudinary,
		backupCustomFramesToCloudinary,
		retrieveCustomFramesFromCloudinary,
		testCloudinaryConnection
	} from '$lib/services/cloudStorage';
	import PrintModal from '$lib/components/PrintModal.svelte';
	import { Camera2Service, type Camera2Device } from '$lib/services/camera2Service';
	import {
		Shield,
		Camera,
		Settings2,
		Cloud,
		Printer,
		Clock,
		History,
		Download,
		Trash2,
		ArrowLeft,
		Save,
		RefreshCw,
		CheckCircle2,
		AlertCircle,
		Palette,
		Plus,
		Upload,
		Image as ImageIcon,
		X,
		Eye,
		ExternalLink,
		Archive,
		CheckSquare,
		Square,
		Layers,
		AlertTriangle,
		Usb,
		ShieldAlert,
		CloudUpload,
		CloudDownload,
		Link as LinkIcon,
		Check
	} from '@lucide/svelte';

	let activeTab = $state<'general' | 'camera' | 'cloud' | 'sessions' | 'frames'>('sessions');

	// Local settings form binding
	let formSettings = $state<KioskSettings>({ ...$settingsStore });
	let cameras = $state<VideoDeviceInfo[]>([]);
	let testVideoElement: HTMLVideoElement | null = $state(null);
	let isTestingCamera = $state(false);

	// Camera2 Native diagnostics
	let nativeCamera2Devices = $state<Camera2Device[]>([]);
	let isScanningCamera2 = $state(false);
	let isCapturingCamera2 = $state(false);
	let camera2PhotoResult = $state<string | null>(null);
	let camera2Error = $state<string | null>(null);

	// UVC Test State
	let isTestingUvc = $state(false);
	let uvcTestResult = $state<UvcCaptureResult | null>(null);

	// Cloudinary Sync & Test States
	let isSyncingFrames = $state(false);
	let isBackingUpFrames = $state(false);
	let isTestingCloudinary = $state(false);
	let cloudinaryTestResult = $state<{ success: boolean; message: string; testUrl?: string } | null>(null);

	// Session logs state
	let sessions = $state<SessionData[]>([]);
	let searchQuery = $state('');
	let rePrintSession = $state<SessionData | null>(null);
	let isRePrintModalOpen = $state(false);
	let saveMessage = $state('');

	let filteredSessions = $derived(
		sessions.filter((s) => {
			const q = searchQuery.toLowerCase();
			return (
				s.sessionId.toLowerCase().includes(q) ||
				(s.guestName && s.guestName.toLowerCase().includes(q))
			);
		})
	);

	// Custom Frame Management state
	let frameFilterSlot = $state<number | 'all'>('all');
	let isAddFrameModalOpen = $state(false);
	let frameInputMode = $state<'upload' | 'url'>('upload');
	let frameDirectUrl = $state('');
	let newFrameName = $state('');
	let newFrameDesc = $state('');
	let newFrameSlots = $state<number>(4);
	let newFrameBgColor = $state('#FFFFFF');
	let newFrameOverlayUrl = $state('');
	let isUploadingImage = $state(false);

	let allFrames = $derived($customFramesStore);

	onMount(async () => {
		formSettings = { ...$settingsStore };
		await loadSessions();
		await refreshCameras();

		if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
			navigator.mediaDevices.addEventListener('devicechange', refreshCameras);
		}
	});

	onDestroy(() => {
		if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
			navigator.mediaDevices.removeEventListener('devicechange', refreshCameras);
		}
		stopCameraTest();
	});

	async function loadSessions() {
		sessions = await getAllSessionsFromDB();
	}

	async function refreshCameras() {
		cameras = await cameraService.getAvailableCameras();
	}

	async function startCameraTest() {
		try {
			const stream = await cameraService.startStream(
				formSettings.cameraDeviceId,
				formSettings.cameraResolution
			);
			if (testVideoElement) {
				testVideoElement.srcObject = stream;
				try {
					await testVideoElement.play();
				} catch (playErr) {
					console.warn('testVideoElement play error:', playErr);
				}
				isTestingCamera = true;
			}
		} catch (err) {
			console.error('Camera test failed:', err);
		}
	}

	function stopCameraTest() {
		cameraService.stopStream();
		isTestingCamera = false;
	}

	async function testUvcCamera() {
		isTestingUvc = true;
		uvcTestResult = null;
		try {
			const res = await uvcCameraService.capturePhoto(false);
			uvcTestResult = res;
		} catch (err: any) {
			uvcTestResult = {
				success: false,
				dataUrl: null,
				blob: null,
				statusCode: -1,
				statusCodeDesc: 'ERROR',
				exitCode: 'plugin_exception',
				message: err?.message || 'Gagal menjalankan tes UVC',
				diagnosticInfo: String(err)
			};
		} finally {
			isTestingUvc = false;
		}
	}

	async function scanNativeCamera2() {
		isScanningCamera2 = true;
		camera2Error = null;
		try {
			nativeCamera2Devices = await Camera2Service.getAvailableCameras();
			if (nativeCamera2Devices.length === 0) {
				camera2Error = 'Tidak ada perangkat kamera yang terdeteksi via Camera2 API atau plugin belum terdaftar di platform ini.';
			}
		} catch (e: any) {
			camera2Error = e?.message || String(e);
		} finally {
			isScanningCamera2 = false;
		}
	}

	async function testNativeCamera2Capture(cameraId: string) {
		isCapturingCamera2 = true;
		camera2Error = null;
		camera2PhotoResult = null;
		try {
			const res = await Camera2Service.captureHighResPhoto(cameraId, 1920, 1080);
			if (res.success && res.dataUrl) {
				camera2PhotoResult = res.dataUrl;
			} else {
				camera2Error = 'Gagal mengambil foto dari Camera2.';
			}
		} catch (e: any) {
			camera2Error = e?.message || String(e);
		} finally {
			isCapturingCamera2 = false;
		}
	}

	function handleSaveSettings() {
		settingsStore.updateSettings(formSettings);
		saveMessage = 'Pengaturan berhasil disimpan!';
		setTimeout(() => (saveMessage = ''), 3000);
	}

	async function handleDeleteSession(sessionId: string) {
		if (confirm(`Hapus data sesi ${sessionId}?`)) {
			await deleteSessionFromDB(sessionId);
			await loadSessions();
		}
	}

	// Multi-select & Batch states
	let selectedSessionIds = $state<string[]>([]);
	let isExportingBatch = $state(false);

	let isAllSelected = $derived(
		filteredSessions.length > 0 &&
		filteredSessions.every((s) => selectedSessionIds.includes(s.sessionId))
	);

	let selectedSessions = $derived(
		sessions.filter((s) => selectedSessionIds.includes(s.sessionId))
	);

	function toggleSelectAll() {
		if (isAllSelected) {
			selectedSessionIds = [];
		} else {
			selectedSessionIds = filteredSessions.map((s) => s.sessionId);
		}
	}

	function toggleSelectSession(id: string) {
		if (selectedSessionIds.includes(id)) {
			selectedSessionIds = selectedSessionIds.filter((sId) => sId !== id);
		} else {
			selectedSessionIds = [...selectedSessionIds, id];
		}
	}

	function clearSelection() {
		selectedSessionIds = [];
	}

	async function handleMultiSelectBackup() {
		if (selectedSessions.length === 0) return;
		try {
			isExportingBatch = true;
			const blob = await createBatchSessionExportZip(selectedSessions);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `ChekiYuume_Backup_${selectedSessions.length}_Sesi_${new Date().toISOString().slice(0, 10)}.zip`;
			a.click();
			URL.revokeObjectURL(url);
			saveMessage = `Berhasil mengunduh backup ${selectedSessions.length} sesi!`;
			setTimeout(() => (saveMessage = ''), 4000);
		} catch (err) {
			console.error('Batch backup failed:', err);
			alert('Gagal membuat paket ZIP batch backup.');
		} finally {
			isExportingBatch = false;
		}
	}

	async function handleBatchBackupAll() {
		if (sessions.length === 0) {
			alert('Tidak ada sesi yang tersimpan untuk di-backup.');
			return;
		}
		try {
			isExportingBatch = true;
			const blob = await createBatchSessionExportZip(sessions);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `ChekiYuume_FULL_BACKUP_${sessions.length}_Sesi_${new Date().toISOString().slice(0, 10)}.zip`;
			a.click();
			URL.revokeObjectURL(url);
			saveMessage = `Berhasil mengunduh FULL BACKUP seluruh (${sessions.length}) sesi!`;
			setTimeout(() => (saveMessage = ''), 4000);
		} catch (err) {
			console.error('Full batch backup failed:', err);
			alert('Gagal membuat paket FULL backup.');
		} finally {
			isExportingBatch = false;
		}
	}

	async function handleMultiSelectDelete() {
		if (selectedSessionIds.length === 0) return;
		if (confirm(`Yakin ingin MENGHAPUS PERMANEN ${selectedSessionIds.length} sesi terpilih dari penyimpanan kios?`)) {
			await deleteMultipleSessionsFromDB(selectedSessionIds);
			selectedSessionIds = [];
			await loadSessions();
			saveMessage = `${selectedSessionIds.length} sesi berhasil dihapus!`;
			setTimeout(() => (saveMessage = ''), 3000);
		}
	}

	async function handleBatchDeleteAll() {
		if (sessions.length === 0) {
			alert('Tidak ada data sesi untuk dihapus.');
			return;
		}
		const input = prompt(`PERINGATAN: Ini akan MENGHAPUS SEMUA ${sessions.length} riwayat sesi secara permanen!\n\nKetik "HAPUS" untuk konfirmasi:`);
		if (input === 'HAPUS' || input === 'hapus') {
			await deleteAllSessionsFromDB();
			selectedSessionIds = [];
			await loadSessions();
			saveMessage = 'Semua riwayat sesi berhasil dibersihkan!';
			setTimeout(() => (saveMessage = ''), 3000);
		}
	}

	function handleTriggerRePrint(session: SessionData) {
		if (session.photostripDataUrl) {
			rePrintSession = session;
			isRePrintModalOpen = true;
		} else {
			alert('Sesi ini tidak memiliki data photostrip untuk dicetak.');
		}
	}

	function handleViewResult(session: SessionData) {
		// Populate active session store with this session and navigate to /result
		sessionStore.initNewSession(session.mode, session.guestName, session.layoutId);
		if (session.photostripDataUrl) {
			sessionStore.setPhotostrip(session.photostripDataUrl, session.photostripBlob || new Blob());
		}
		if (session.videostripUrl && session.videostripBlob) {
			sessionStore.setVideostrip(session.videostripBlob, session.videostripUrl);
		}
		sessionStore.setLayout(session.layoutId);
		goto('/result');
	}

	async function handleRetrieveFramesFromCloud() {
		if (
			formSettings.cloudProvider !== 'cloudinary' ||
			!formSettings.cloudinaryCloudName?.trim()
		) {
			alert('Mohon atur dan simpan Cloudinary Cloud Name terlebih dahulu di tab Cloud 30-Day.');
			return;
		}

		isSyncingFrames = true;
		try {
			const res = await retrieveCustomFramesFromCloudinary(formSettings.cloudinaryCloudName);
			if (res.success && res.frames.length > 0) {
				const added = customFramesStore.syncFromRemote(res.frames);
				saveMessage = `Berhasil menyinkronkan ${res.count} frame dari Cloudinary! (${added} frame baru ditambahkan)`;
			} else if (res.success) {
				saveMessage = 'Sinkronisasi selesai: Tidak ada frame baru ditemukan di Cloudinary.';
			} else {
				alert(res.error || 'Gagal menyinkronkan frame dari Cloudinary.');
			}
		} catch (err: any) {
			alert(`Gagal mengambil frame dari Cloud: ${err?.message || err}`);
		} finally {
			isSyncingFrames = false;
			setTimeout(() => (saveMessage = ''), 4000);
		}
	}

	async function handleBackupFramesToCloud() {
		if (
			formSettings.cloudProvider !== 'cloudinary' ||
			!formSettings.cloudinaryCloudName?.trim() ||
			!formSettings.cloudinaryUploadPreset?.trim()
		) {
			alert('Mohon lengkapi Cloud Name & Upload Preset Cloudinary di tab Cloud 30-Day terlebih dahulu.');
			return;
		}

		const customFrames = allFrames.filter((f) => f.id.startsWith('custom-'));
		if (customFrames.length === 0) {
			alert('Belum ada custom frame untuk dicadangkan ke Cloudinary. Tambahkan frame kustom terlebih dahulu.');
			return;
		}

		isBackingUpFrames = true;
		try {
			const res = await backupCustomFramesToCloudinary(
				allFrames,
				formSettings.cloudinaryCloudName,
				formSettings.cloudinaryUploadPreset
			);
			if (res.success) {
				saveMessage = `Berhasil mencadangkan ${res.count} custom frame ke Cloudinary (chekiyuume/frames_manifest.json)!`;
			} else {
				alert(res.error || 'Gagal mencadangkan frame ke Cloudinary.');
			}
		} catch (err: any) {
			alert(`Gagal mencadangkan frame: ${err?.message || err}`);
		} finally {
			isBackingUpFrames = false;
			setTimeout(() => (saveMessage = ''), 4000);
		}
	}

	async function handleTestCloudinary() {
		isTestingCloudinary = true;
		cloudinaryTestResult = null;
		try {
			const res = await testCloudinaryConnection(
				formSettings.cloudinaryCloudName || '',
				formSettings.cloudinaryUploadPreset || ''
			);
			cloudinaryTestResult = res;
		} catch (err: any) {
			cloudinaryTestResult = {
				success: false,
				message: `Error tidak terduga: ${err?.message || err}`
			};
		} finally {
			isTestingCloudinary = false;
		}
	}

	async function handleImageUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			const file = target.files[0];
			isUploadingImage = true;

			// 1. Try upload to Cloudinary in dedicated subfolder chekiyuume/frames/
			if (
				formSettings.cloudProvider === 'cloudinary' &&
				formSettings.cloudinaryCloudName?.trim() &&
				formSettings.cloudinaryUploadPreset?.trim()
			) {
				try {
					const cloudUrl = await uploadCustomFrameOverlayToCloudinary(
						file,
						newFrameName || file.name.replace(/\.[^/.]+$/, ''),
						formSettings.cloudinaryCloudName.trim(),
						formSettings.cloudinaryUploadPreset.trim()
					);
					newFrameOverlayUrl = cloudUrl;
					isUploadingImage = false;
					return;
				} catch (err) {
					console.warn('[Frames] Cloudinary direct upload failed, fallback to local dataURL:', err);
				}
			}

			// 2. Fallback to local DataURL (Offline / No Cloudinary)
			const reader = new FileReader();
			reader.onload = (ev) => {
				newFrameOverlayUrl = (ev.target?.result as string) || '';
				isUploadingImage = false;
			};
			reader.readAsDataURL(file);
		}
	}

	function handleCreateFrame() {
		if (!newFrameName.trim()) {
			alert('Mohon masukkan nama frame.');
			return;
		}

		const finalOverlay =
			frameInputMode === 'url'
				? frameDirectUrl.trim() || undefined
				: newFrameOverlayUrl || undefined;

		customFramesStore.addFrame({
			name: newFrameName,
			description: newFrameDesc,
			mode: 'default',
			totalSlots: newFrameSlots,
			backgroundColor: newFrameBgColor,
			overlayUrl: finalOverlay
		});

		// Reset form
		newFrameName = '';
		newFrameDesc = '';
		newFrameSlots = 4;
		newFrameBgColor = '#FFFFFF';
		newFrameOverlayUrl = '';
		frameDirectUrl = '';
		frameInputMode = 'upload';
		isAddFrameModalOpen = false;

		saveMessage = 'Frame baru berhasil ditambahkan!';
		setTimeout(() => (saveMessage = ''), 3000);
	}

	function handleDeleteFrame(frameId: string, name: string) {
		if (confirm(`Hapus template frame "${name}"?`)) {
			customFramesStore.deleteFrame(frameId);
			saveMessage = 'Frame berhasil dihapus!';
			setTimeout(() => (saveMessage = ''), 3000);
		}
	}

	function handleResetFrames() {
		if (confirm('Kembalikan semua frame ke pengaturan bawaan standar?')) {
			customFramesStore.resetToDefault();
			saveMessage = 'Frame dikembalikan ke setelan pabrik!';
			setTimeout(() => (saveMessage = ''), 3000);
		}
	}

	async function handleExportZip(session: SessionData) {
		try {
			const blob = await createSessionExportZip(session);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `ChekiYuume_${session.guestName || 'Guest'}_${session.sessionId}.zip`;
			a.click();
			URL.revokeObjectURL(url);
			saveMessage = `Berhasil mengunduh ZIP sesi ${session.sessionId}!`;
			setTimeout(() => (saveMessage = ''), 3000);
		} catch (err) {
			console.error('Export ZIP failed:', err);
			alert('Gagal mengunduh file ZIP sesi.');
		}
	}

	let filteredFrames = $derived(
		allFrames.filter((f) => {
			if (frameFilterSlot === 'all') return true;
			return f.totalSlots === frameFilterSlot;
		})
	);
</script>

<div class="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 p-6 overflow-hidden">
	<!-- Admin Top Bar -->
	<header class="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl shrink-0">
		<div class="flex items-center gap-4">
			<button
				type="button"
				onclick={() => { stopCameraTest(); goto('/'); }}
				class="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
				title="Kembali ke Kiosk"
			>
				<ArrowLeft class="h-5 w-5" />
			</button>
			<div>
				<div class="flex items-center gap-2">
					<Shield class="h-5 w-5 text-rose-400" />
					<h1 class="text-xl font-black text-white font-display">Kiosk Admin Dashboard</h1>
				</div>
				<p class="text-xs text-zinc-400">Pengaturan Kamera, Printer, Cloud & Manajemen Frame Kustom</p>
			</div>
		</div>

		<!-- Nav Tabs -->
		<div class="flex items-center gap-1.5 bg-zinc-800/80 p-1.5 rounded-2xl border border-zinc-700/50">
			<button
				type="button"
				onclick={() => (activeTab = 'sessions')}
				class="flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer {activeTab === 'sessions' ? 'bg-rose-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'}"
			>
				<History class="h-4 w-4" />
				<span>Riwayat ({sessions.length})</span>
			</button>
			<button
				type="button"
				onclick={() => (activeTab = 'frames')}
				class="flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer {activeTab === 'frames' ? 'bg-rose-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'}"
			>
				<Palette class="h-4 w-4" />
				<span>Kelola Frame ({allFrames.length})</span>
			</button>
			<button
				type="button"
				onclick={() => (activeTab = 'camera')}
				class="flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer {activeTab === 'camera' ? 'bg-rose-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'}"
			>
				<Camera class="h-4 w-4" />
				<span>Kamera</span>
			</button>
			<button
				type="button"
				onclick={() => (activeTab = 'general')}
				class="flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer {activeTab === 'general' ? 'bg-rose-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'}"
			>
				<Settings2 class="h-4 w-4" />
				<span>Booth & Print</span>
			</button>
			<button
				type="button"
				onclick={() => (activeTab = 'cloud')}
				class="flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer {activeTab === 'cloud' ? 'bg-rose-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'}"
			>
				<Cloud class="h-4 w-4" />
				<span>Cloud 30-Day</span>
			</button>
		</div>
	</header>

	<!-- Main Content Area -->
	<main class="flex-1 overflow-y-auto mt-6 min-h-0">
		{#if activeTab === 'sessions'}
			<!-- Tab 1: Sessions Log Table & Batch Management -->
			<div class="flex flex-col gap-4 bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl">
				<!-- Header with Global Batch Buttons & Search -->
				<div class="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
					<div>
						<h2 class="text-lg font-bold text-white font-display flex items-center gap-2">
							<span>Manajemen Sesi Pengunjung</span>
							<span class="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400 font-mono border border-zinc-700">
								{sessions.length} Sesi
							</span>
						</h2>
						<p class="text-xs text-zinc-400">Semua foto snapshot mentah, video BTS, photostrip & videostrip tersimpan aman di IndexedDB kiosk</p>
					</div>

					<div class="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Cari nama tamu atau ID sesi..."
							class="flex-1 sm:w-64 rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2 text-xs text-white placeholder-zinc-500 focus:border-rose-500 focus:outline-hidden"
						/>
						<button
							type="button"
							onclick={loadSessions}
							class="flex items-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 px-3.5 py-2 text-xs font-bold text-zinc-300 border border-zinc-700 cursor-pointer"
							title="Segarkan data dari database"
						>
							<RefreshCw class="h-3.5 w-3.5" />
							<span>Segarkan</span>
						</button>

						<!-- Global Batch Backup All -->
						<button
							type="button"
							onclick={handleBatchBackupAll}
							disabled={sessions.length === 0 || isExportingBatch}
							class="flex items-center gap-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/40 px-3.5 py-2 text-xs font-bold text-indigo-300 hover:text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							title="Backup SEMUA sesi ke dalam 1 file master ZIP"
						>
							<Archive class="h-3.5 w-3.5" />
							<span>Backup Semua ({sessions.length})</span>
						</button>

						<!-- Global Batch Delete All -->
						<button
							type="button"
							onclick={handleBatchDeleteAll}
							disabled={sessions.length === 0}
							class="flex items-center gap-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/30 border border-red-500/30 px-3.5 py-2 text-xs font-bold text-red-400 hover:text-red-200 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							title="Hapus SEMUA riwayat sesi"
						>
							<Trash2 class="h-3.5 w-3.5" />
							<span>Hapus Semua</span>
						</button>
					</div>
				</div>

				<!-- Multi-Select Action Bar (Shows when 1 or more sessions selected) -->
				{#if selectedSessionIds.length > 0}
					<div class="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-indigo-950/80 to-purple-950/80 border border-indigo-500/50 rounded-2xl p-3.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
						<div class="flex items-center gap-2.5">
							<div class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500 text-white font-bold text-xs">
								{selectedSessionIds.length}
							</div>
							<span class="text-xs font-bold text-white">
								{selectedSessionIds.length} sesi terpilih dari {filteredSessions.length} sesi yang ditampilkan
							</span>
						</div>

						<div class="flex items-center gap-2">
							<!-- Multi-Select Backup ZIP -->
							<button
								type="button"
								onclick={handleMultiSelectBackup}
								disabled={isExportingBatch}
								class="flex items-center gap-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50"
							>
								{#if isExportingBatch}
									<RefreshCw class="h-3.5 w-3.5 animate-spin" />
									<span>Membuat ZIP...</span>
								{:else}
									<Download class="h-3.5 w-3.5" />
									<span>Backup Terpilih ({selectedSessionIds.length}) (.ZIP)</span>
								{/if}
							</button>

							<!-- Multi-Select Delete -->
							<button
								type="button"
								onclick={handleMultiSelectDelete}
								class="flex items-center gap-1.5 rounded-xl bg-red-500 hover:bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all cursor-pointer"
							>
								<Trash2 class="h-3.5 w-3.5" />
								<span>Hapus Terpilih ({selectedSessionIds.length})</span>
							</button>

							<!-- Clear Selection -->
							<button
								type="button"
								onclick={clearSelection}
								class="flex items-center gap-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer"
							>
								<X class="h-3.5 w-3.5" />
								<span>Batal</span>
							</button>
						</div>
					</div>
				{/if}

				<!-- Table with Master & Row Checkboxes -->
				<div class="overflow-x-auto rounded-2xl border border-zinc-800">
					<table class="w-full text-left text-xs text-zinc-300">
						<thead class="bg-zinc-800/80 uppercase text-[10px] font-extrabold text-zinc-400 border-b border-zinc-700/60 select-none">
							<tr>
								<!-- Master Checkbox -->
								<th class="py-3 px-4 w-10 text-center">
									<input
										type="checkbox"
										checked={isAllSelected}
										onchange={toggleSelectAll}
										class="h-4 w-4 rounded-md accent-indigo-500 cursor-pointer"
										title={isAllSelected ? 'Batalkan pilih semua' : 'Pilih semua sesi'}
									/>
								</th>
								<th class="py-3 px-4">Waktu</th>
								<th class="py-3 px-4">Nama Sesi / Tamu</th>
								<th class="py-3 px-4">Mode</th>
								<th class="py-3 px-4">ID Sesi</th>
								<th class="py-3 px-4">Jumlah Foto</th>
								<th class="py-3 px-4">Status Cetak</th>
								<th class="py-3 px-4 text-right">Aksi</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-zinc-800/60">
							{#if filteredSessions.length === 0}
								<tr>
									<td colspan="8" class="py-8 text-center text-zinc-500">
										Belum ada riwayat sesi tersimpan.
									</td>
								</tr>
							{:else}
								{#each filteredSessions as s}
									{@const isSelected = selectedSessionIds.includes(s.sessionId)}
									<tr class="transition-colors {isSelected ? 'bg-indigo-950/30 hover:bg-indigo-950/50' : 'hover:bg-zinc-800/40'}">
										<!-- Row Checkbox -->
										<td class="py-3 px-4 text-center">
											<input
												type="checkbox"
												checked={isSelected}
												onchange={() => toggleSelectSession(s.sessionId)}
												class="h-4 w-4 rounded-md accent-indigo-500 cursor-pointer"
											/>
										</td>
										<td class="py-3 px-4 text-zinc-400">
											{new Date(s.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
										</td>
										<td class="py-3 px-4 font-bold text-white">
											{s.guestName || '-'}
										</td>
										<td class="py-3 px-4">
											<span class="rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase {s.mode === 'creative' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">
												{s.mode}
											</span>
										</td>
										<td class="py-3 px-4 font-mono text-zinc-400">
											{s.sessionId}
										</td>
										<td class="py-3 px-4">
											{s.photos.length} Foto
										</td>
										<td class="py-3 px-4">
											{#if s.printCount > 0}
												<span class="text-emerald-400 font-semibold">{s.printCount}x Cetak</span>
											{:else}
												<span class="text-zinc-500">Belum Cetak</span>
											{/if}
										</td>
										<td class="py-3 px-4 text-right">
											<div class="flex items-center justify-end gap-2">
												<!-- View Result Screen -->
												<button
													type="button"
													onclick={() => handleViewResult(s)}
													class="rounded-lg bg-rose-500/20 hover:bg-rose-500 border border-rose-500/30 p-2 text-rose-300 hover:text-white cursor-pointer transition-colors"
													title="Buka Layar Hasil (Result Screen)"
												>
													<Eye class="h-3.5 w-3.5" />
												</button>

												<!-- Open Guest Share Link -->
												<a
													href="/share/{s.sessionId}"
													target="_blank"
													class="rounded-lg bg-zinc-800 hover:bg-zinc-700 p-2 text-zinc-300 hover:text-white cursor-pointer transition-colors"
													title="Buka Link Download Tamu (/share/{s.sessionId})"
												>
													<ExternalLink class="h-3.5 w-3.5" />
												</a>

												<!-- Re-print -->
												<button
													type="button"
													onclick={() => handleTriggerRePrint(s)}
													class="rounded-lg bg-zinc-800 hover:bg-zinc-700 p-2 text-zinc-300 hover:text-white cursor-pointer transition-colors"
													title="Cetak Ulang (Re-Print)"
												>
													<Printer class="h-3.5 w-3.5" />
												</button>

												<!-- Export Single ZIP -->
												<button
													type="button"
													onclick={() => handleExportZip(s)}
													class="rounded-lg bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/30 p-2 text-indigo-300 hover:text-white cursor-pointer transition-colors"
													title="Unduh Paket ZIP Sesi Ini"
												>
													<Download class="h-3.5 w-3.5" />
												</button>

												<!-- Delete Single -->
												<button
													type="button"
													onclick={() => handleDeleteSession(s.sessionId)}
													class="rounded-lg bg-red-500/10 hover:bg-red-500/30 p-2 text-red-400 cursor-pointer transition-colors"
													title="Hapus Sesi Ini"
												>
													<Trash2 class="h-3.5 w-3.5" />
												</button>
											</div>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</div>

		{:else if activeTab === 'frames'}
			<!-- Tab 2: Custom Frame Management & Upload -->
			<div class="flex flex-col gap-6 bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl">
				<div class="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
					<div>
						<h2 class="text-lg font-bold text-white font-display flex items-center gap-2">
							<span>Manajemen Desain & Template Frame</span>
							<span class="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400 font-mono border border-zinc-700">
								{allFrames.length} Total Frame
							</span>
						</h2>
						<p class="text-xs text-zinc-400">Tambah frame kustom bertema event, atur warna latar, upload overlay PNG ke Cloudinary, dan sinkronkan antar-kios</p>
					</div>

					<div class="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
						<!-- Retrieve from Cloudinary Button -->
						<button
							type="button"
							onclick={handleRetrieveFramesFromCloud}
							disabled={isSyncingFrames}
							class="flex items-center gap-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/40 px-3.5 py-2 text-xs font-bold text-indigo-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
							title="Tarik & sinkronkan daftar template frame dari Cloudinary (chekiyuume/frames_manifest.json)"
						>
							{#if isSyncingFrames}
								<RefreshCw class="h-3.5 w-3.5 animate-spin" />
								<span>Menarik dari Cloud...</span>
							{:else}
								<CloudDownload class="h-3.5 w-3.5" />
								<span>Tarik dari Cloud</span>
							{/if}
						</button>

						<!-- Backup to Cloudinary Button -->
						<button
							type="button"
							onclick={handleBackupFramesToCloud}
							disabled={isBackingUpFrames}
							class="flex items-center gap-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600 border border-purple-500/40 px-3.5 py-2 text-xs font-bold text-purple-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
							title="Cadangkan seluruh konfigurasi custom frame ke Cloudinary"
						>
							{#if isBackingUpFrames}
								<RefreshCw class="h-3.5 w-3.5 animate-spin" />
								<span>Mencadangkan...</span>
							{:else}
								<CloudUpload class="h-3.5 w-3.5" />
								<span>Backup ke Cloud</span>
							{/if}
						</button>

						<button
							type="button"
							onclick={handleResetFrames}
							class="rounded-xl bg-zinc-800 hover:bg-zinc-700 px-3.5 py-2 text-xs font-bold text-zinc-300 border border-zinc-700 transition-all cursor-pointer"
						>
							Reset ke Default
						</button>

						<button
							type="button"
							onclick={() => (isAddFrameModalOpen = true)}
							class="flex items-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
						>
							<Plus class="h-4 w-4" />
							<span>Upload Frame Baru</span>
						</button>
					</div>
				</div>

				<!-- Slot Filter Badges -->
				<div class="flex items-center gap-2 border-y border-zinc-800 py-3">
					<span class="text-xs font-bold text-zinc-400 mr-2">Filter Slot:</span>
					{#each (['all', 1, 2, 3, 4] as const) as slotOpt}
						<button
							type="button"
							onclick={() => (frameFilterSlot = slotOpt)}
							class="rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer {frameFilterSlot === slotOpt ? 'bg-rose-500 text-white shadow-md' : 'bg-zinc-800 text-zinc-400 hover:text-white'}"
						>
							{slotOpt === 'all' ? 'Semua Frame' : `${slotOpt} Slot`}
						</button>
					{/each}
				</div>

				<!-- Grid of Frames -->
				<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
					{#each filteredFrames as frame}
						<div class="relative flex flex-col items-center justify-between rounded-3xl p-5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all shadow-md">
							<!-- Mini Frame Thumbnail -->
							<div class="my-2 flex items-center justify-center h-40 w-full overflow-hidden">
								<div
									class="relative rounded-2xl shadow-md border border-zinc-700/40 overflow-hidden"
									style="background-color: {frame.backgroundColor || '#FFFFFF'}; height: 140px; width: auto; aspect-ratio: {frame.canvasWidth} / {frame.canvasHeight};"
								>
									{#if frame.backgroundUrl}
										<img src={frame.backgroundUrl} alt="Background" class="absolute inset-0 h-full w-full object-cover pointer-events-none" />
									{/if}

									{#each frame.slots as slot}
										<div
											class="absolute rounded-xs bg-zinc-700/50 border border-zinc-600/40 shadow-inner"
											style="left: {(slot.x / frame.canvasWidth) * 100}%; top: {(slot.y / frame.canvasHeight) * 100}%; width: {(slot.width / frame.canvasWidth) * 100}%; height: {(slot.height / frame.canvasHeight) * 100}%;"
										></div>
									{/each}

									{#if frame.overlayUrl}
										<img src={frame.overlayUrl} alt="Overlay" class="absolute inset-0 h-full w-full object-contain pointer-events-none z-10" />
									{/if}

									{#if !frame.overlayUrl}
										<div class="absolute bottom-1 inset-x-0 w-full text-center z-10">
											<div class="text-[5px] font-black tracking-wider uppercase {frame.backgroundColor === '#18181B' ? 'text-white' : 'text-zinc-900'}">
												CHEKIYUUME
											</div>
										</div>
									{/if}
								</div>
							</div>

							<!-- Card Info -->
							<div class="w-full mt-2 text-center">
								<div class="flex items-center justify-center gap-1.5 mb-1.5 flex-wrap">
									<span class="h-3 w-3 rounded-full border border-white/30" style="background-color: {frame.backgroundColor};"></span>
									<span class="text-[10px] font-extrabold uppercase text-rose-400">{frame.totalSlots} Slot • {frame.aspectRatioLabel}</span>
									{#if frame.overlayUrl && frame.overlayUrl.includes('cloudinary')}
										<span class="rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 text-[9px] font-bold">
											Cloud CDN
										</span>
									{/if}
								</div>
								<h3 class="text-sm font-bold text-white font-display truncate">
									{frame.name}
								</h3>
								<p class="text-[10px] text-zinc-400 mt-1 line-clamp-2">
									{frame.description}
								</p>
							</div>

							<!-- Actions -->
							<div class="w-full mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
								<span class="text-[9px] font-mono text-zinc-500 uppercase">
									{frame.id.startsWith('custom-') ? 'Custom Upload' : 'Bawaan'}
								</span>
								{#if frame.id.startsWith('custom-')}
									<button
										type="button"
										onclick={() => handleDeleteFrame(frame.id, frame.name)}
										class="rounded-lg bg-red-500/10 hover:bg-red-500/30 p-1.5 text-red-400 cursor-pointer"
										title="Hapus Frame Kustom"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

		{:else if activeTab === 'camera'}
			<!-- Tab 3: Camera Settings -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div class="flex flex-col gap-5 bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-bold text-white font-display">Pengaturan Sumber Kamera</h2>
						{#if formSettings.cameraSource === 'internal'}
							<button
								type="button"
								onclick={refreshCameras}
								class="flex items-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-bold text-rose-400 border border-zinc-700 cursor-pointer active:scale-95 transition-all"
								title="Pindai ulang kamera yang terhubung"
							>
								<RefreshCw class="h-3.5 w-3.5" />
								<span>Pindai Ulang ({cameras.length})</span>
							</button>
						{/if}
					</div>

					<!-- Camera Mode Selector (Internal WebRTC vs External USB UVC) -->
					<div>
						<span class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Tipe Kamera yang Digunakan</span>
						<div class="grid grid-cols-2 gap-3">
							<button
								type="button"
								onclick={() => (formSettings.cameraSource = 'internal')}
								class="flex items-center justify-center gap-2 rounded-2xl py-3 px-3 text-xs font-bold border transition-all cursor-pointer {formSettings.cameraSource !== 'uvc' ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-md' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}"
							>
								<Camera class="h-4 w-4" />
								<span>Kamera Internal (WebRTC)</span>
							</button>
							<button
								type="button"
								onclick={() => (formSettings.cameraSource = 'uvc')}
								class="flex items-center justify-center gap-2 rounded-2xl py-3 px-3 text-xs font-bold border transition-all cursor-pointer {formSettings.cameraSource === 'uvc' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-md' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}"
							>
								<Usb class="h-4 w-4" />
								<span>Kamera USB / UVC (Native OTG)</span>
							</button>
						</div>
					</div>

					{#if formSettings.cameraSource === 'uvc'}
						<!-- UVC Mode Details & Tips -->
						<div class="rounded-2xl bg-indigo-950/40 border border-indigo-500/30 p-4 text-[11px] text-zinc-300 leading-relaxed space-y-2">
							<div class="flex items-center gap-2 font-bold text-indigo-400 text-xs">
								<Usb class="h-4 w-4" />
								<span>Mode Kamera USB / UVC Aktif (Android OTG)</span>
							</div>
							<p class="text-zinc-300">
								Pada mode ini, foto photobooth akan diambil langsung melalui native driver USB Camera OTG (bukan melalui WebRTC WebView).
							</p>
							<ul class="list-disc list-inside text-zinc-400 space-y-1">
								<li>Pastikan fitur <strong>OTG Connection</strong> diaktifkan di menu Pengaturan Android jika HP/Tablet memilikinya.</li>
								<li>Saat pertama kali membuka kamera, Android akan memunculkan popup izin akses USB. Pilih <strong>"Izinkan / Selalu Buka"</strong>.</li>
							</ul>
						</div>
					{:else}
						<!-- Internal & USB Camera Config -->
						<div>
							<div class="flex items-center justify-between mb-2">
								<label for="camera-select" class="block text-xs font-bold uppercase tracking-wider text-zinc-400">Pilih Perangkat Kamera</label>
								<span class="text-[11px] text-emerald-400 font-bold">✨ Mendukung USB OTG & Internal</span>
							</div>
							<select
								id="camera-select"
								bind:value={formSettings.cameraDeviceId}
								class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
							>
								<option value="">Default OS / Browser Camera</option>
								{#each cameras as cam}
									<option value={cam.deviceId}>{cam.label}</option>
								{/each}
							</select>
							<p class="text-[11px] text-zinc-400 mt-2 leading-relaxed">
								💡 <strong>Tips USB OTG:</strong> Sambungkan webcam/kamera USB ke port OTG HP/Tablet, lalu tekan tombol <strong>"Pindai Ulang ({cameras.length})"</strong> di pojok kanan atas. Kamera USB akan otomatis terdeteksi dengan akselerasi GPU hardware penuh.
							</p>
						</div>

						<div>
							<div class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Resolusi Capture</div>
							<div class="grid grid-cols-3 gap-2">
								<button
									type="button"
									onclick={() => (formSettings.cameraResolution = '720p')}
									class="rounded-xl py-2.5 text-xs font-bold border transition-all cursor-pointer {formSettings.cameraResolution === '720p' ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}"
								>
									720p HD
								</button>
								<button
									type="button"
									onclick={() => (formSettings.cameraResolution = '1080p')}
									class="rounded-xl py-2.5 text-xs font-bold border transition-all cursor-pointer {formSettings.cameraResolution === '1080p' ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}"
								>
									1080p FHD
								</button>
								<button
									type="button"
									onclick={() => (formSettings.cameraResolution = '4k')}
									class="rounded-xl py-2.5 text-xs font-bold border transition-all cursor-pointer {formSettings.cameraResolution === '4k' ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}"
								>
									4K UHD
								</button>
							</div>
						</div>

						<div class="flex items-center justify-between py-2 border-t border-zinc-800">
							<div>
								<span class="text-xs font-bold text-white">Cermin Kamera (Mirroring)</span>
								<p class="text-[11px] text-zinc-400">Membuat preview kamera seperti cermin selfie</p>
							</div>
							<input
								type="checkbox"
								bind:checked={formSettings.isMirrored}
								class="h-5 w-5 rounded-md accent-rose-500 cursor-pointer"
							/>
						</div>
					{/if}

					<button
						type="button"
						onclick={handleSaveSettings}
						class="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-500 hover:bg-rose-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-rose-500/20 transition-all cursor-pointer mt-2"
					>
						<Save class="h-4 w-4" />
						<span>Simpan Pengaturan Kamera</span>
					</button>
				</div>

				<!-- Live Camera / UVC Tester -->
				<div class="flex flex-col bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl">
					{#if formSettings.cameraSource === 'uvc'}
						<!-- UVC Dedicated Tester with Diagnostics -->
						<div class="flex items-center justify-between mb-4">
							<h2 class="text-lg font-bold text-white font-display">Uji Diagnostik Kamera USB (UVC)</h2>
							<button
								type="button"
								disabled={isTestingUvc}
								onclick={testUvcCamera}
								class="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 cursor-pointer transition-all active:scale-95"
							>
								{#if isTestingUvc}
									<RefreshCw class="h-3.5 w-3.5 animate-spin" />
									<span>Memanggil Kamera USB...</span>
								{:else}
									<Usb class="h-3.5 w-3.5" />
									<span>Uji Ambil Foto UVC</span>
								{/if}
							</button>
						</div>

						<div class="relative flex-1 min-h-[300px] rounded-2xl bg-zinc-950 p-5 overflow-hidden border border-zinc-800 flex flex-col items-center justify-center text-center">
							{#if isTestingUvc}
								<div class="flex flex-col items-center gap-3">
									<RefreshCw class="h-10 w-10 text-indigo-400 animate-spin" />
									<p class="text-xs text-zinc-300 font-bold">Membuka antarmuka kamera USB native...</p>
								</div>
							{:else if uvcTestResult}
								<!-- Diagnostic Result Card -->
								<div class="w-full flex flex-col items-center gap-3 animate-in fade-in duration-200">
									<div class="flex items-center gap-2">
										{#if uvcTestResult.success}
											<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
												<CheckCircle2 class="h-6 w-6" />
											</div>
										{:else}
											<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
												<ShieldAlert class="h-6 w-6" />
											</div>
										{/if}
										<div class="text-left">
											<h4 class="text-sm font-bold text-white font-display">
												{uvcTestResult.success ? 'Kamera USB Terdeteksi & Berhasil' : 'Kamera USB Belum Berhasil'}
											</h4>
											<span class="text-[11px] font-mono font-bold {uvcTestResult.success ? 'text-emerald-400' : 'text-amber-400'}">
												Status: {uvcTestResult.statusCode} • Exit: {uvcTestResult.exitCode}
											</span>
										</div>
									</div>

									<div class="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-3 text-left max-h-56 overflow-y-auto">
										<pre class="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
{uvcTestResult.diagnosticInfo}
										</pre>
									</div>

									<div class="flex gap-2 w-full">
										<button
											type="button"
											onclick={() => {
												try {
													navigator.clipboard.writeText(`UVC Diagnostic Report [${uvcTestResult?.exitCode}]:\n${uvcTestResult?.diagnosticInfo}`);
													alert('Laporan diagnostik berhasil disalin ke clipboard!');
												} catch (_) {}
											}}
											class="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2 text-xs font-bold text-white shadow-md transition-colors cursor-pointer"
										>
											📋 Salin Laporan Error
										</button>
										{#if uvcCameraService.getLatestNativeCrash()}
											<button
												type="button"
												onclick={() => {
													const crash = uvcCameraService.getLatestNativeCrash();
													if (crash) {
														navigator.clipboard.writeText(`[Fatal Crash Log]:\n${crash}`);
														alert('Fatal Crash Log disalin!');
													}
												}}
												class="rounded-xl bg-rose-600/80 hover:bg-rose-500 py-2 px-3 text-xs font-bold text-white shadow-md transition-colors cursor-pointer"
											>
												⚠️ Salin Crash Log
											</button>
										{/if}
									</div>

									{#if uvcTestResult.dataUrl}
										<div class="w-full mt-2 flex flex-col items-center">
											<span class="text-[10px] uppercase font-bold text-zinc-500 mb-1">Hasil Jepretan UVC:</span>
											<img src={uvcTestResult.dataUrl} alt="UVC Test Snapshot" class="max-h-44 rounded-xl border border-zinc-700 shadow-md object-contain" />
										</div>
									{/if}
								</div>
							{:else}
								<div class="text-center text-zinc-500 text-xs max-w-xs">
									<Usb class="h-10 w-10 mx-auto mb-2 text-indigo-400/60" />
									<p class="text-zinc-300 font-bold mb-1">Tes Kompatibilitas USB UVC</p>
									<span>Klik tombol "Uji Ambil Foto UVC" di atas untuk memicu native bridge dan membaca status koneksi kamera OTG.</span>
								</div>
							{/if}
						</div>
					{:else}
						<!-- Standard Internal Live Camera Tester -->
						<div class="flex items-center justify-between mb-4">
							<h2 class="text-lg font-bold text-white font-display">Uji Coba Stream Kamera</h2>
							{#if isTestingCamera}
								<button
									type="button"
									onclick={stopCameraTest}
									class="rounded-xl bg-red-500/20 border border-red-500/30 px-3 py-1 text-xs font-bold text-red-300 cursor-pointer"
								>
									Hentikan Uji
								</button>
							{:else}
								<button
									type="button"
									onclick={startCameraTest}
									class="rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-300 cursor-pointer"
								>
									Mulai Uji Kamera
								</button>
							{/if}
						</div>

						<div class="relative flex-1 min-h-[300px] rounded-2xl bg-black overflow-hidden border border-zinc-800 flex items-center justify-center">
							<video
								bind:this={testVideoElement}
								autoplay
								playsinline
								muted
								class="h-full w-full object-cover {formSettings.isMirrored ? '-scale-x-100' : 'scale-x-100'}"
							></video>
							{#if !isTestingCamera}
								<div class="absolute text-center text-zinc-500 text-xs">
									<Camera class="h-8 w-8 mx-auto mb-2 opacity-50" />
									<span>Klik "Mulai Uji Kamera" untuk melihat live feed</span>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Native Camera2 Diagnostics Card -->
				<div class="col-span-1 lg:col-span-2 flex flex-col bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl gap-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-base font-bold text-white font-display flex items-center gap-2">
								<Shield class="h-4 w-4 text-emerald-400" />
								<span>Diagnostik Native Android Camera2 (Driver Resmi OS)</span>
							</h3>
							<p class="text-xs text-zinc-400">
								Memindai perangkat kamera via sistem Camera2 resmi Android (Depan, Belakang, & Webcam USB OTG External)
							</p>
						</div>
						<button
							type="button"
							disabled={isScanningCamera2}
							onclick={scanNativeCamera2}
							class="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 cursor-pointer transition-all active:scale-95"
						>
							{#if isScanningCamera2}
								<RefreshCw class="h-3.5 w-3.5 animate-spin" />
								<span>Memindai Camera2...</span>
							{:else}
								<RefreshCw class="h-3.5 w-3.5" />
								<span>Pindai Native Camera2 ({nativeCamera2Devices.length})</span>
							{/if}
						</button>
					</div>

					{#if camera2Error}
						<div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
							<AlertTriangle class="h-4 w-4 shrink-0" />
							<span>{camera2Error}</span>
						</div>
					{/if}

					{#if nativeCamera2Devices.length > 0}
						<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
							{#each nativeCamera2Devices as cam}
								<div class="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between gap-3">
									<div>
										<div class="flex items-center justify-between mb-1">
											<span class="text-xs font-bold text-white">{cam.name}</span>
											<span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full {cam.isExternal ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-zinc-800 text-zinc-300'}">
												ID: {cam.id}
											</span>
										</div>
										<p class="text-[11px] text-zinc-400">
											Facing: <strong class="text-zinc-200 capitalize">{cam.facing}</strong> • Max: <strong class="text-zinc-200">{cam.maxResolution}</strong>
										</p>
									</div>

									<button
										type="button"
										disabled={isCapturingCamera2}
										onclick={() => testNativeCamera2Capture(cam.id)}
										class="w-full flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 py-2 text-xs font-bold text-emerald-400 border border-zinc-700 transition-colors cursor-pointer"
									>
										{#if isCapturingCamera2}
											<RefreshCw class="h-3 w-3 animate-spin" />
											<span>Mengambil...</span>
										{:else}
											<Camera class="h-3 w-3" />
											<span>Uji Jepret Resolusi Penuh</span>
										{/if}
									</button>
								</div>
							{/each}
						</div>
					{/if}

					{#if camera2PhotoResult}
						<div class="p-4 rounded-2xl bg-zinc-950 border border-emerald-500/30 flex flex-col items-center gap-2">
							<div class="flex items-center gap-2 text-emerald-400 text-xs font-bold">
								<CheckCircle2 class="h-4 w-4" />
								<span>Hasil Jepretan Native Camera2 Hardware Berhasil!</span>
							</div>
							<img src={camera2PhotoResult} alt="Camera2 Capture" class="max-h-60 rounded-xl border border-zinc-700 shadow-lg object-contain" />
						</div>
					{/if}
				</div>
			</div>

		{:else if activeTab === 'general'}
			<!-- Tab 4: Booth & Printing Settings -->
			<div class="max-w-2xl bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col gap-5">
				<h2 class="text-lg font-bold text-white font-display">Pengaturan Booth & Print Default</h2>

				<div>
					<label for="kiosk-title-input" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Judul Utama Booth</label>
					<input
						id="kiosk-title-input"
						type="text"
						bind:value={formSettings.kioskTitle}
						placeholder="CHEKIYUUME"
						class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
					/>
				</div>

				<div>
					<label for="kiosk-sub-input" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Sub-Judul / Nama Studio</label>
					<input
						id="kiosk-sub-input"
						type="text"
						bind:value={formSettings.kioskSubtitle}
						placeholder="PHOTOBOOTH STUDIO"
						class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="countdown-select" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Countdown Hitung Mundur (Detik)</label>
						<select
							id="countdown-select"
							bind:value={formSettings.countdownSeconds}
							class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
						>
							<option value={3}>3 Detik (Sangat Cepat)</option>
							<option value={5}>5 Detik (Standar)</option>
							<option value={7}>7 Detik (Santai)</option>
						</select>
					</div>

					<div>
						<label for="reset-select" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Auto-Reset Result Screen</label>
						<select
							id="reset-select"
							bind:value={formSettings.autoResetSeconds}
							class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
						>
							<option value={30}>30 Detik</option>
							<option value={60}>60 Detik</option>
							<option value={90}>90 Detik (Standar)</option>
						</select>
					</div>
				</div>

				<div>
					<label for="admin-pin-input" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">PIN Akses Admin</label>
					<input
						id="admin-pin-input"
						type="password"
						bind:value={formSettings.adminPin}
						placeholder="1234"
						class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
					/>
				</div>

				<div class="flex items-center justify-between py-2 border-t border-zinc-800">
					<div>
						<span class="text-xs font-bold text-white">Efek Suara (Audio Beeps & Shutter)</span>
						<p class="text-[11px] text-zinc-400">Bunyi hitung mundur dan simulasi klik kamera</p>
					</div>
					<input
						type="checkbox"
						bind:checked={formSettings.enableSound}
						class="h-5 w-5 rounded-md accent-rose-500 cursor-pointer"
					/>
				</div>

				<button
					type="button"
					onclick={handleSaveSettings}
					class="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-500 hover:bg-rose-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-rose-500/20 transition-all cursor-pointer mt-4"
				>
					<Save class="h-4 w-4" />
					<span>Simpan Pengaturan Booth</span>
				</button>
			</div>

		{:else if activeTab === 'cloud'}
			<!-- Tab 5: Cloud Storage Settings -->
			<div class="max-w-2xl bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col gap-5">
				<h2 class="text-lg font-bold text-white font-display">Cloud Storage & Kebijakan 30 Hari TTL</h2>
				<p class="text-xs text-zinc-400">
					Konfigurasi penyimpanan cloud untuk melayani QR Code download tamu. File akan tersimpan selama 30 hari secara otomatis.
				</p>

				<div>
					<label for="cloud-provider-select" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Provider Cloud Storage</label>
					<select
						id="cloud-provider-select"
						bind:value={formSettings.cloudProvider}
						class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
					>
						<option value="cloudinary">Cloudinary (Sangat Direkomendasikan - Kuota 25 GB Gratis, No CC, Unsigned Direct Upload)</option>
						<option value="none">Mode Offline / Local Server Only (Tanpa Cloud Eksternal)</option>
						<option value="r2">Cloudflare R2 (Bebas Biaya Egress)</option>
						<option value="s3">Amazon AWS S3 / MinIO</option>
						<option value="supabase">Supabase Storage</option>
					</select>
				</div>

				{#if formSettings.cloudProvider === 'cloudinary'}
					<!-- Cloudinary Specific Settings -->
					<div class="rounded-2xl bg-indigo-950/40 border border-indigo-500/30 p-4 text-xs text-indigo-200">
						<p class="font-bold text-white mb-1">Panduan Pengaturan Cloudinary:</p>
						<ol class="list-decimal ml-4 space-y-1 text-indigo-300">
							<li>Buka <a href="https://cloudinary.com" target="_blank" class="underline text-indigo-200 hover:text-white">Cloudinary Dashboard</a> & salin <strong>Cloud Name</strong>.</li>
							<li>Buka <em>Settings &gt; Upload presets</em> &gt; buat preset baru dengan Signing Mode <strong>Unsigned</strong>.</li>
							<li>Salin nama preset ke kolom di bawah ini. Tanpa perlu memasukkan password/API secret!</li>
						</ol>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="cloudinary-cloud-name" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Cloud Name</label>
							<input
								id="cloudinary-cloud-name"
								type="text"
								bind:value={formSettings.cloudinaryCloudName}
								placeholder="contoh: dxyzk123"
								class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
							/>
						</div>

						<div>
							<label for="cloudinary-upload-preset" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Upload Preset (Unsigned)</label>
							<input
								id="cloudinary-upload-preset"
								type="text"
								bind:value={formSettings.cloudinaryUploadPreset}
								placeholder="contoh: chekiyuume_preset"
								class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
							/>
						</div>
					</div>

					<div>
						<label for="cloud-base-url-input" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Domain Public Share Base URL (Opsional)</label>
						<input
							id="cloud-base-url-input"
							type="text"
							bind:value={formSettings.cloudPublicBaseUrl}
							placeholder="https://cheki-yuume.pages.dev (atau biarkan kosong untuk domain saat ini)"
							class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
						/>
					</div>

					<!-- Test Connection Button & Result -->
					<div class="pt-2 border-t border-zinc-800 flex flex-col gap-3">
						<div class="flex items-center justify-between">
							<div>
								<span class="text-xs font-bold text-white">Uji Koneksi & Pembuatan Folder</span>
								<p class="text-[11px] text-zinc-400">Memverifikasi Cloud Name & Upload Preset dengan upload 1-pixel test</p>
							</div>
							<button
								type="button"
								onclick={handleTestCloudinary}
								disabled={isTestingCloudinary || !formSettings.cloudinaryCloudName || !formSettings.cloudinaryUploadPreset}
								class="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50 cursor-pointer transition-all"
							>
								{#if isTestingCloudinary}
									<RefreshCw class="h-3.5 w-3.5 animate-spin" />
									<span>Menguji...</span>
								{:else}
									<Check class="h-3.5 w-3.5" />
									<span>Uji Koneksi Cloudinary</span>
								{/if}
							</button>
						</div>

						{#if cloudinaryTestResult}
							<div class="rounded-2xl p-3.5 border text-xs animate-in fade-in duration-200 {cloudinaryTestResult.success ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-red-950/40 border-red-500/40 text-red-300'}">
								<div class="flex items-start gap-2">
									{#if cloudinaryTestResult.success}
										<CheckCircle2 class="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
									{:else}
										<AlertCircle class="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
									{/if}
									<div class="flex-1">
										<p class="font-bold">{cloudinaryTestResult.message}</p>
										{#if cloudinaryTestResult.testUrl}
											<a href={cloudinaryTestResult.testUrl} target="_blank" class="text-[11px] underline text-emerald-200 hover:text-white mt-1 inline-block">
												Lihat aset test di Cloudinary ↗
											</a>
										{/if}
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Structure Info Box -->
					<div class="rounded-2xl bg-zinc-950/60 border border-zinc-800/80 p-4 text-[11px] text-zinc-400 space-y-1.5 font-mono">
						<div class="text-xs font-bold text-zinc-300 font-sans mb-1">📁 Struktur Folder Cloudinary Otomatis:</div>
						<p>• <strong>chekiyuume/sessions/{`{guest}_{sessionId}`}/photostrip.png</strong> (Foto strip)</p>
						<p>• <strong>chekiyuume/sessions/{`{guest}_{sessionId}`}/videostrip.mp4</strong> (Video BTS strip)</p>
						<p>• <strong>chekiyuume/frames/</strong> (Template frame overlay PNG)</p>
						<p>• <strong>chekiyuume/frames_manifest.json</strong> (Backup konfigurasi frame)</p>
					</div>

				{:else if formSettings.cloudProvider !== 'none'}
					<!-- S3 / R2 / Supabase Settings -->
					<div>
						<label for="cloud-base-url-input" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Domain Public Share Base URL</label>
						<input
							id="cloud-base-url-input"
							type="text"
							bind:value={formSettings.cloudPublicBaseUrl}
							placeholder="https://photobooth.chekiyuume.com"
							class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
						/>
					</div>

					<div>
						<label for="cloud-endpoint-input" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">S3/R2 Endpoint URL</label>
						<input
							id="cloud-endpoint-input"
							type="text"
							bind:value={formSettings.cloudEndpoint}
							placeholder="https://<account_id>.r2.cloudflarestorage.com"
							class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
						/>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="cloud-bucket-input" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Bucket Name</label>
							<input
								id="cloud-bucket-input"
								type="text"
								bind:value={formSettings.cloudBucket}
								placeholder="chekiyuume-sessions"
								class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
							/>
						</div>
						<div>
							<label for="cloud-key-input" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Access Key ID</label>
							<input
								id="cloud-key-input"
								type="text"
								bind:value={formSettings.cloudAccessKey}
								placeholder="AKIA..."
								class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
							/>
						</div>
					</div>

					<div>
						<label for="cloud-secret-input" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Secret Access Key</label>
						<input
							id="cloud-secret-input"
							type="password"
							bind:value={formSettings.cloudSecretKey}
							placeholder="••••••••••••"
							class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-3 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
						/>
					</div>
				{/if}

				<button
					type="button"
					onclick={handleSaveSettings}
					class="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-500 hover:bg-rose-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-rose-500/20 transition-all cursor-pointer mt-4"
				>
					<Save class="h-4 w-4" />
					<span>Simpan Konfigurasi Cloud</span>
				</button>
			</div>
		{/if}

		{#if saveMessage}
			<div class="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-emerald-500 text-white px-5 py-3 shadow-2xl font-bold text-xs animate-in slide-in-from-bottom duration-200">
				<CheckCircle2 class="h-4 w-4" />
				<span>{saveMessage}</span>
			</div>
		{/if}
	</main>

	<!-- Modal: Upload & Tambah Frame Baru -->
	{#if isAddFrameModalOpen}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
			<div class="w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-800 p-6 sm:p-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
				<!-- Header -->
				<div class="flex items-center justify-between pb-4 border-b border-zinc-800 shrink-0">
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
							<Palette class="h-5 w-5" />
						</div>
						<div>
							<h3 class="text-lg font-bold text-white font-display">Tambah Template Frame Baru</h3>
							<p class="text-xs text-zinc-400">Atur jumlah slot dan upload desain frame kustom</p>
						</div>
					</div>
					<button
						type="button"
						onclick={() => (isAddFrameModalOpen = false)}
						class="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<!-- Form Body -->
				<div class="flex flex-col gap-4 py-5 overflow-y-auto flex-1">
					<div>
						<label for="new-frame-name" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Nama Frame</label>
						<input
							id="new-frame-name"
							type="text"
							bind:value={newFrameName}
							placeholder="Contoh: Wedding Kevin & Vania 4-Cut"
							class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-2.5 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
						/>
					</div>

					<div>
						<label for="new-frame-desc" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Deskripsi / Catatan Event</label>
						<input
							id="new-frame-desc"
							type="text"
							bind:value={newFrameDesc}
							placeholder="Contoh: Frame custom tema gold & floral"
							class="w-full rounded-2xl bg-zinc-800 border border-zinc-700 py-2.5 px-4 text-xs text-white focus:border-rose-500 focus:outline-hidden"
						/>
					</div>

					<div>
						<div class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Jumlah Slot Foto</div>
						<div class="grid grid-cols-4 gap-2">
							{#each [1, 2, 3, 4] as count}
								<button
									type="button"
									onclick={() => (newFrameSlots = count)}
									class="rounded-xl py-2 text-xs font-bold border transition-all cursor-pointer {newFrameSlots === count ? 'bg-rose-500 text-white border-rose-500' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}"
								>
									{count} Slot
								</button>
							{/each}
						</div>
					</div>

					<div>
						<label for="new-frame-bg" class="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Warna Background Frame</label>
						<div class="flex items-center gap-3">
							<input
								id="new-frame-bg"
								type="color"
								bind:value={newFrameBgColor}
								class="h-10 w-16 rounded-xl bg-transparent cursor-pointer border border-zinc-700 p-1"
							/>
							<input
								type="text"
								bind:value={newFrameBgColor}
								class="w-32 rounded-xl bg-zinc-800 border border-zinc-700 py-2 px-3 text-xs text-white font-mono"
							/>
							<!-- Quick Presets -->
							<div class="flex gap-1.5">
								{#each ['#FFFFFF', '#18181B', '#FDF2F0', '#EFF6F1', '#F0F7FF', '#FAF7F2'] as preset}
									<button
										type="button"
										onclick={() => (newFrameBgColor = preset)}
										class="h-7 w-7 rounded-full border border-white/20 cursor-pointer transition-transform hover:scale-110"
										style="background-color: {preset};"
										title={preset}
									></button>
								{/each}
							</div>
						</div>
					</div>

					<!-- Image Overlay Input Mode Tabs -->
					<div>
						<div class="flex items-center justify-between mb-2">
							<span class="text-xs font-bold uppercase tracking-wider text-zinc-400">Gambar Overlay / Frame Artwork</span>
							<div class="flex items-center gap-1 bg-zinc-800 p-1 rounded-xl border border-zinc-700/60">
								<button
									type="button"
									onclick={() => (frameInputMode = 'upload')}
									class="px-2.5 py-1 text-[10px] font-bold rounded-lg transition-colors cursor-pointer {frameInputMode === 'upload' ? 'bg-rose-500 text-white shadow-xs' : 'text-zinc-400 hover:text-white'}"
								>
									Upload File
								</button>
								<button
									type="button"
									onclick={() => (frameInputMode = 'url')}
									class="px-2.5 py-1 text-[10px] font-bold rounded-lg transition-colors cursor-pointer {frameInputMode === 'url' ? 'bg-rose-500 text-white shadow-xs' : 'text-zinc-400 hover:text-white'}"
								>
									Tautan / URL
								</button>
							</div>
						</div>

						{#if frameInputMode === 'upload'}
							<label class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-700 hover:border-rose-500/60 bg-zinc-800/40 p-5 text-center cursor-pointer transition-all">
								{#if isUploadingImage}
									<div class="flex flex-col items-center gap-2 py-4">
										<RefreshCw class="h-8 w-8 text-rose-500 animate-spin" />
										<span class="text-xs font-bold text-zinc-300">Mengunggah ke Cloudinary (chekiyuume/frames)...</span>
									</div>
								{:else if newFrameOverlayUrl}
									<div class="relative max-h-32 mb-2">
										<img src={newFrameOverlayUrl} alt="Preview Frame" class="max-h-32 rounded-lg object-contain shadow-md" />
										<button
											type="button"
											onclick={(e) => { e.preventDefault(); newFrameOverlayUrl = ''; }}
											class="absolute -top-2 -right-2 rounded-full bg-red-500 text-white p-1 shadow-md cursor-pointer"
										>
											<X class="h-3 w-3" />
										</button>
									</div>
									<div class="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
										<CheckCircle2 class="h-3.5 w-3.5" />
										<span>Overlay siap dipasang ({newFrameOverlayUrl.includes('cloudinary') ? 'Cloudinary Hosted' : 'Lokal'})</span>
									</div>
								{:else}
									<Upload class="h-7 w-7 text-zinc-500 mb-2" />
									<span class="text-xs font-bold text-zinc-300">Pilih berkas gambar (PNG transparan disarankan)</span>
									<span class="text-[10px] text-zinc-500 mt-1">Lebar 1080px (akan otomatis diupload ke Cloudinary jika aktif)</span>
								{/if}
								<input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange={handleImageUpload} />
							</label>
						{:else}
							<div class="flex flex-col gap-2 bg-zinc-800/40 border border-zinc-700/60 rounded-2xl p-4">
								<label for="direct-url-input" class="text-[11px] text-zinc-400 font-medium">
									Masukkan URL gambar Cloudinary atau CDN publik:
								</label>
								<div class="flex items-center gap-2">
									<input
										id="direct-url-input"
										type="url"
										bind:value={frameDirectUrl}
										placeholder="https://res.cloudinary.com/.../image/upload/.../frame.png"
										class="w-full rounded-xl bg-zinc-800 border border-zinc-700 py-2 px-3 text-xs text-white focus:border-rose-500 focus:outline-hidden font-mono"
									/>
									{#if frameDirectUrl}
										<button
											type="button"
											onclick={() => (frameDirectUrl = '')}
											class="p-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white"
										>
											<X class="h-3.5 w-3.5" />
										</button>
									{/if}
								</div>
								{#if frameDirectUrl}
									<div class="flex items-center gap-3 mt-2">
										<img src={frameDirectUrl} alt="Preview direct URL" class="h-16 w-auto rounded-lg border border-zinc-700 shadow-md object-contain bg-zinc-900" />
										<span class="text-[10px] text-emerald-400 font-bold">✓ Pratinjau URL berhasil dimuat</span>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Footer -->
				<div class="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3 shrink-0">
					<button
						type="button"
						onclick={() => (isAddFrameModalOpen = false)}
						class="rounded-xl bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 text-xs font-bold text-zinc-300 cursor-pointer"
					>
						Batal
					</button>
					<button
						type="button"
						onclick={handleCreateFrame}
						class="flex items-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-500/20 cursor-pointer"
					>
						<Save class="h-4 w-4" />
						<span>Simpan Frame</span>
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Re-Print Modal -->
	{#if rePrintSession && rePrintSession.photostripDataUrl}
		<PrintModal
			isOpen={isRePrintModalOpen}
			photostripDataUrl={rePrintSession.photostripDataUrl}
			onClose={() => { isRePrintModalOpen = false; rePrintSession = null; }}
		/>
	{/if}
</div>
