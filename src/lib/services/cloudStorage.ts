import QRCode from 'qrcode';
import type { SessionData, KioskSettings, FrameLayout } from '$lib/types';
import { saveSessionToDB } from '$lib/services/db';

export async function generateQrCodeDataUrl(text: string): Promise<string> {
	try {
		return await QRCode.toDataURL(text, {
			width: 320,
			margin: 1,
			color: {
				dark: '#000000',
				light: '#ffffff'
			},
			errorCorrectionLevel: 'M'
		});
	} catch (err) {
		console.error('[QR] Failed to generate QR code:', err);
		return '';
	}
}

export interface CloudinaryUploadOptions {
	folder?: string;
	publicId?: string;
	fileName?: string;
	tags?: string[];
	context?: Record<string, string>;
	overwrite?: boolean;
	signed?: boolean;
}

/**
 * Uploads a single file to Cloudinary.
 * If overwrite or signed is requested, attempts a Signed Upload via Cloudflare Pages Function (/api/sign-cloudinary).
 * Otherwise defaults to standard Unsigned Upload Preset.
 */
export async function uploadToCloudinary(
	file: Blob | File | string,
	resourceType: 'image' | 'video' | 'raw' | 'auto',
	cloudName: string,
	uploadPreset: string,
	optionsOrPublicId?: CloudinaryUploadOptions | string
): Promise<string> {
	let options: CloudinaryUploadOptions = {};
	if (typeof optionsOrPublicId === 'string') {
		options = { publicId: optionsOrPublicId };
	} else if (optionsOrPublicId) {
		options = optionsOrPublicId;
	}

	const formData = new FormData();

	// Explicit filename determination
	let fileName = options.fileName;
	if (!fileName) {
		if (file instanceof File && file.name) {
			fileName = file.name;
		} else if (resourceType === 'video') {
			fileName = 'videostrip.mp4';
		} else if (resourceType === 'raw') {
			fileName = 'manifest.json';
		} else {
			fileName = 'photostrip.png';
		}
	}

	// Supply explicit filename to multipart body so Cloudinary does not default to "blob"
	if (file instanceof Blob) {
		formData.append('file', file, fileName);
	} else {
		formData.append('file', file);
	}

	let cleanFolder = options.folder ? options.folder.replace(/^\/+|\/+$/g, '') : undefined;
	let cleanPublicId = options.publicId;
	if (cleanFolder && cleanPublicId && cleanPublicId.startsWith(cleanFolder)) {
		cleanPublicId = cleanPublicId.slice(cleanFolder.length).replace(/^\/+/, '');
	}

	let isSigned = false;

	// When overwrite or signed is requested, attempt signed upload via Cloudflare Pages Function
	if (options.overwrite || options.signed) {
		try {
			console.log(`[CloudUpload] Requesting signed upload signature for "${cleanPublicId || fileName}"...`);
			const signRes = await fetch('/api/sign-cloudinary', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					folder: cleanFolder,
					public_id: cleanPublicId,
					overwrite: true,
					tags: options.tags
				})
			});

			if (signRes.ok) {
				const signData = await signRes.json();
				if (signData && signData.success && signData.signature) {
					formData.append('api_key', signData.apiKey);
					formData.append('timestamp', String(signData.timestamp));
					formData.append('signature', signData.signature);
					formData.append('overwrite', 'true');
					if (cleanFolder) formData.append('folder', cleanFolder);
					if (cleanPublicId) formData.append('public_id', cleanPublicId);
					if (options.tags && options.tags.length > 0) formData.append('tags', options.tags.join(','));
					isSigned = true;
					console.log('[CloudUpload] ✓ Signed signature received from Cloudflare Pages Function (overwrite enabled)');
				} else {
					console.warn('[CloudUpload] /api/sign-cloudinary was not successful:', signData?.error);
				}
			} else {
				console.warn(`[CloudUpload] /api/sign-cloudinary returned HTTP ${signRes.status}, falling back to unsigned preset.`);
			}
		} catch (signErr) {
			console.warn('[CloudUpload] Could not reach /api/sign-cloudinary, falling back to unsigned preset:', signErr);
		}
	}

	if (!isSigned) {
		formData.append('upload_preset', uploadPreset);
		if (cleanFolder) {
			formData.append('folder', cleanFolder);
			formData.append('asset_folder', cleanFolder);
		}
		if (cleanPublicId) {
			formData.append('public_id', cleanPublicId);
		}
		if (fileName) {
			if (resourceType === 'raw') {
				formData.append('filename_override', fileName);
			} else {
				const nameOnly = fileName.replace(/\.[^/.]+$/, '');
				formData.append('filename_override', nameOnly);
			}
		}
		if (options.tags && options.tags.length > 0) {
			formData.append('tags', options.tags.join(','));
		}
		if (options.context) {
			const ctxStr = Object.entries(options.context)
				.map(([k, v]) => `${k}=${v}`)
				.join('|');
			formData.append('context', ctxStr);
		}
	}

	const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
	console.log(`[CloudUpload] Uploading ${resourceType} "${fileName || 'blob'}" (${isSigned ? 'SIGNED' : 'UNSIGNED'}) to Cloudinary (${cloudName})...`);
	const res = await fetch(endpoint, {
		method: 'POST',
		body: formData
	});

	if (!res.ok) {
		const errJson = await res.json().catch(() => ({}));
		console.error(`[CloudUpload] ✗ Upload failed (${res.status}):`, errJson);
		throw new Error(`Cloudinary upload failed (${res.status}): ${errJson.error?.message || res.statusText}`);
	}

	const data = await res.json();
	console.log(`[CloudUpload] ✓ Upload success for "${fileName || 'file'}":`, {
		public_id: data.public_id,
		secure_url: data.secure_url,
		bytes: data.bytes
	});
	return data.secure_url;
}

/**
 * Uploads session assets (Photostrip & Videostrip) to structured Cloudinary folders
 */
export async function uploadSessionToCloud(
	session: SessionData,
	settings: KioskSettings
): Promise<{ photoUrl: string | null; videoUrl: string | null; shareUrl: string }> {
	const fallbackShareUrl = `${window.location.origin}/share/${session.sessionId}`;

	// Handle Cloudinary Provider
	if (settings.cloudProvider === 'cloudinary') {
		const cloudName = settings.cloudinaryCloudName?.trim();
		const uploadPreset = settings.cloudinaryUploadPreset?.trim();

		if (!cloudName || !uploadPreset) {
			console.warn('[Cloudinary] Cloud Name or Upload Preset is not configured.');
			return {
				photoUrl: null,
				videoUrl: null,
				shareUrl: fallbackShareUrl
			};
		}

		let photoUrl: string | null = null;
		let videoUrl: string | null = null;

		// Format structured folder name: chekiyuume/sessions/{guestName}_{sessionId}
		const sanitizedGuestName = session.guestName
			? session.guestName
					.trim()
					.toLowerCase()
					.replace(/[^a-z0-9_-]/g, '_')
					.replace(/_+/g, '_')
					.slice(0, 30)
			: 'guest';
		const sessionFolder = `chekiyuume/sessions/${sanitizedGuestName}_${session.sessionId}`;

		try {
			// 1. Upload Photostrip
			if (session.photostripBlob) {
				photoUrl = await uploadToCloudinary(
					session.photostripBlob,
					'image',
					cloudName,
					uploadPreset,
					{
						folder: sessionFolder,
						publicId: `photostrip_${session.sessionId}`,
						fileName: `photostrip_${session.sessionId}.png`,
						tags: ['chekiyuume', 'session', 'photostrip', session.sessionId, sanitizedGuestName]
					}
				);
			} else if (session.photostripDataUrl) {
				const res = await fetch(session.photostripDataUrl);
				const blob = await res.blob();
				photoUrl = await uploadToCloudinary(
					blob,
					'image',
					cloudName,
					uploadPreset,
					{
						folder: sessionFolder,
						publicId: `photostrip_${session.sessionId}`,
						fileName: `photostrip_${session.sessionId}.png`,
						tags: ['chekiyuume', 'session', 'photostrip', session.sessionId, sanitizedGuestName]
					}
				);
			}

			// 2. Upload Videostrip (if available)
			if (session.videostripBlob) {
				videoUrl = await uploadToCloudinary(
					session.videostripBlob,
					'video',
					cloudName,
					uploadPreset,
					{
						folder: sessionFolder,
						publicId: `videostrip_${session.sessionId}`,
						fileName: `videostrip_${session.sessionId}.mp4`,
						tags: ['chekiyuume', 'session', 'videostrip', session.sessionId, sanitizedGuestName]
					}
				);
			}

			// Construct Share Page URL with query params
			const basePublicUrl = settings.cloudPublicBaseUrl?.trim() || window.location.origin;
			const shareParams = new URLSearchParams();
			if (photoUrl) shareParams.set('p', photoUrl);
			if (videoUrl) shareParams.set('v', videoUrl);
			if (session.guestName) shareParams.set('n', session.guestName);

			const queryString = shareParams.toString();
			const shareUrl = `${basePublicUrl}/share/${session.sessionId}${queryString ? `?${queryString}` : ''}`;

			// 3. Upload per-session manifest.json into chekiyuume/sessions/{guestName}_{sessionId}/manifest.json
			let manifestUrl: string | undefined = undefined;
			try {
				const sessionManifestData = {
					sessionId: session.sessionId,
					guestName: session.guestName || '',
					createdAt: session.createdAt || Date.now(),
					mode: session.mode,
					layoutId: session.layoutId,
					photoUrl: photoUrl || undefined,
					videoUrl: videoUrl || undefined,
					shareUrl,
					printCount: session.printCount || 0
				};
				const sessionManifestBlob = new Blob([JSON.stringify(sessionManifestData, null, 2)], {
					type: 'application/json'
				});
				manifestUrl = await uploadToCloudinary(
					sessionManifestBlob,
					'raw',
					cloudName,
					uploadPreset,
					{
						folder: sessionFolder,
						publicId: 'manifest.json',
						fileName: 'manifest.json',
						overwrite: true,
						tags: ['chekiyuume', 'session_manifest', session.sessionId, sanitizedGuestName]
					}
				);
			} catch (mErr) {
				console.warn('[Cloudinary] Per-session manifest upload warning:', mErr);
			}

			// Automatically append session into central Cloudinary sessions_manifest.json
			try {
				await recordSessionToCloudinaryManifest(
					{
						sessionId: session.sessionId,
						guestName: session.guestName,
						mode: session.mode,
						layoutId: session.layoutId,
						photoUrl: photoUrl || undefined,
						videoUrl: videoUrl || undefined,
						shareUrl,
						manifestUrl,
						createdAt: session.createdAt || Date.now()
					},
					cloudName,
					uploadPreset
				);
			} catch (e) {
				console.warn('[Cloudinary] Session manifest sync warning:', e);
			}

			return {
				photoUrl,
				videoUrl,
				shareUrl
			};
		} catch (err) {
			console.error('[Cloudinary] Upload failed, using fallback:', err);
			return {
				photoUrl,
				videoUrl,
				shareUrl: fallbackShareUrl
			};
		}
	}

	if (settings.cloudProvider === 'none' || !settings.cloudEndpoint) {
		// Offline / Local-only mode
		return {
			photoUrl: null,
			videoUrl: null,
			shareUrl: fallbackShareUrl
		};
	}

	try {
		// S3 / R2 Bucket structure
		const basePublicUrl = settings.cloudPublicBaseUrl || window.location.origin;
		const shareUrl = `${basePublicUrl}/share/${session.sessionId}`;

		return {
			photoUrl: `${settings.cloudEndpoint}/${settings.cloudBucket}/${session.sessionId}/photostrip.png`,
			videoUrl: `${settings.cloudEndpoint}/${settings.cloudBucket}/${session.sessionId}/videostrip.mp4`,
			shareUrl
		};
	} catch (err) {
		console.error('[Cloud] Upload failed, falling back to local share URL:', err);
		return {
			photoUrl: null,
			videoUrl: null,
			shareUrl: fallbackShareUrl
		};
	}
}

/**
 * Uploads a Custom Frame Overlay PNG to Cloudinary in dedicated folder chekiyuume/frames
 */
export async function uploadCustomFrameOverlayToCloudinary(
	file: Blob | File,
	frameName: string,
	cloudName: string,
	uploadPreset: string
): Promise<string> {
	const sanitizedName =
		frameName
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]/g, '_')
			.replace(/_+/g, '_')
			.slice(0, 30) || 'frame';
	const uniqueId = `frame_${sanitizedName}_${Date.now()}`;

	return await uploadToCloudinary(file, 'image', cloudName, uploadPreset, {
		folder: 'chekiyuume/frames',
		publicId: uniqueId,
		fileName: `${uniqueId}.png`,
		tags: ['chekiyuume', 'frame', 'custom_frame', sanitizedName]
	});
}

/**
 * Backs up all custom frame templates as a JSON manifest to Cloudinary
 */
export async function backupCustomFramesToCloudinary(
	frames: FrameLayout[],
	cloudName: string,
	uploadPreset: string
): Promise<{ success: boolean; url?: string; count: number; error?: string }> {
	try {
		const customOnly = frames.filter((f) => f.id.startsWith('custom-'));

		// Anti-Duplication: Ensure manifest never contains duplicate frame names
		const seen = new Set<string>();
		const dedupedCustom: FrameLayout[] = [];
		for (const f of customOnly) {
			const norm = f.name.trim().toLowerCase().replace(/\s+/g, ' ');
			if (!seen.has(norm)) {
				seen.add(norm);
				dedupedCustom.push(f);
			}
		}

		const manifestData = {
			version: '1.0',
			updatedAt: Date.now(),
			totalCustomFrames: dedupedCustom.length,
			frames: dedupedCustom
		};

		const blob = new Blob([JSON.stringify(manifestData, null, 2)], {
			type: 'application/json'
		});

		const manifestUrl = await uploadToCloudinary(blob, 'raw', cloudName, uploadPreset, {
			folder: 'chekiyuume',
			publicId: 'frames_manifest.json',
			fileName: 'frames_manifest.json',
			overwrite: true,
			tags: ['chekiyuume', 'frames_manifest', 'backup']
		});

		return {
			success: true,
			url: manifestUrl,
			count: customOnly.length
		};
	} catch (err: any) {
		console.error('[Frames] Failed to backup frames manifest to Cloudinary:', err);
		return {
			success: false,
			count: 0,
			error: err?.message || String(err)
		};
	}
}

/**
 * Retrieves custom frame templates manifest from Cloudinary
 */
export async function retrieveCustomFramesFromCloudinary(
	cloudName: string
): Promise<{ success: boolean; frames: FrameLayout[]; count: number; error?: string }> {
	try {
		const cleanCloud = cloudName.trim();
		if (!cleanCloud) {
			throw new Error('Cloudinary Cloud Name belum diisi.');
		}

		console.log(`[FramesRetrieve] Fetching custom frames manifest from Cloudinary: "${cleanCloud}"...`);

		const candidateUrls: string[] = [
			`/api/manifest?type=frames&_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/frames_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/frames_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/frames_manifest?_t=${Date.now()}`
		];

		let data: any = null;
		let lastStatus = 0;

		for (const url of candidateUrls) {
			try {
				console.log(`[FramesRetrieve] Checking URL: ${url}`);
				const res = await fetch(url, {
					cache: 'no-store',
					headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' }
				});
				lastStatus = res.status;
				console.log(`[FramesRetrieve] -> HTTP ${res.status}`);
				if (res.ok) {
					const json = await res.json();
					if (json && Array.isArray(json.frames)) {
						data = json;
						console.log(`[FramesRetrieve] ✓ Frames manifest parsed successfully! Total frames: ${data.frames.length}`);
						break;
					}
				}
			} catch (fetchErr) {
				console.warn(`[FramesRetrieve] Fetch error at ${url}:`, fetchErr);
			}
		}

		if (!data) {
			console.warn(`[FramesRetrieve] Manifest frames belum ditemukan di Cloudinary (HTTP ${lastStatus || 404})`);
			return {
				success: false,
				frames: [],
				count: 0,
				error: 'Belum ada manifest frame di Cloudinary (chekiyuume/frames_manifest.json). Lakukan "Backup ke Cloud" terlebih dahulu di tab Frame Designer.'
			};
		}

		return {
			success: true,
			frames: data.frames,
			count: data.frames.length
		};
	} catch (err: any) {
		console.warn('[FramesRetrieve] ✗ Retrieve frames from Cloudinary failed:', err);
		return {
			success: false,
			frames: [],
			count: 0,
			error: err?.message || String(err)
		};
	}
}

/**
 * Tests Cloudinary settings by attempting a 1px test upload to chekiyuume/tests
 */
export async function testCloudinaryConnection(
	cloudName: string,
	uploadPreset: string
): Promise<{ success: boolean; message: string; testUrl?: string }> {
	try {
		const cleanCloud = cloudName.trim();
		const cleanPreset = uploadPreset.trim();

		if (!cleanCloud || !cleanPreset) {
			return {
				success: false,
				message: 'Cloud Name dan Upload Preset wajib diisi terlebih dahulu!'
			};
		}

		// 1x1 transparent PNG data URI
		const testPixelBase64 =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=';
		const res = await fetch(testPixelBase64);
		const testBlob = await res.blob();

		const testUrl = await uploadToCloudinary(testBlob, 'image', cleanCloud, cleanPreset, {
			folder: 'chekiyuume/tests',
			publicId: `test_connection_${Date.now()}`,
			fileName: 'test_pixel.png',
			tags: ['chekiyuume', 'test_connection']
		});

		return {
			success: true,
			message: 'Koneksi Cloudinary Berhasil! Folder chekiyuume/tests/ berhasil dibuat.',
			testUrl
		};
	} catch (err: any) {
		return {
			success: false,
			message: `Koneksi Cloudinary Gagal: ${err?.message || String(err)}`
		};
	}
}

export interface CloudSessionSummary {
	sessionId: string;
	guestName?: string;
	mode: string;
	layoutId: string;
	photoUrl?: string;
	videoUrl?: string;
	shareUrl?: string;
	manifestUrl?: string;
	createdAt: number;
}

/**
 * Appends / updates a session entry in the central Cloudinary sessions_manifest.json
 */
export async function recordSessionToCloudinaryManifest(
	session: CloudSessionSummary,
	cloudName: string,
	uploadPreset: string
): Promise<void> {
	try {
		const cleanCloud = cloudName.trim();
		const cleanPreset = uploadPreset.trim();
		if (!cleanCloud || !cleanPreset) {
			console.warn('[CloudSync] Cannot record session to global manifest: Cloud Name or Upload Preset is empty.');
			return;
		}

		console.log(`[CloudSync] Recording session "${session.sessionId}" (${session.guestName || 'Tamu'}) to global manifest on cloud "${cleanCloud}"...`);

		let existingSessions: CloudSessionSummary[] = [];
		const candidateUrls: string[] = [
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/sessions_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions_manifest?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/sessions_manifest?_t=${Date.now()}`
		];

		if (typeof localStorage !== 'undefined') {
			const cachedUrl = localStorage.getItem('cheki_last_sessions_manifest_url');
			if (cachedUrl) {
				const unversionedCached = cachedUrl.replace(/\/raw\/upload\/v[0-9]+\//, '/raw/upload/');
				const sep = unversionedCached.includes('?') ? '&' : '?';
				candidateUrls.push(`${unversionedCached}${sep}_t=${Date.now()}`);
			}
		}

		for (let idx = 0; idx < candidateUrls.length; idx++) {
			const url = candidateUrls[idx];
			try {
				console.log(`[CloudSync] [${idx + 1}/${candidateUrls.length}] Checking existing manifest at: ${url}`);
				const res = await fetch(url, {
					cache: 'no-store',
					headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' }
				});
				console.log(`[CloudSync] -> HTTP ${res.status} ${res.statusText}`);
				if (res.ok) {
					const data = await res.json();
					if (data && Array.isArray(data.sessions)) {
						existingSessions = data.sessions;
						console.log(`[CloudSync] ✓ Existing manifest found! Total existing sessions: ${existingSessions.length}`);
						break;
					}
				}
			} catch (fetchErr) {
				console.warn(`[CloudSync] Manifest check error at ${url}:`, fetchErr);
			}
		}

		// Remove duplicate if already present
		existingSessions = existingSessions.filter((s) => s.sessionId !== session.sessionId);
		// Add newest at top
		existingSessions.unshift(session);
		// Limit to 500 latest sessions
		if (existingSessions.length > 500) {
			existingSessions = existingSessions.slice(0, 500);
		}

		const manifestData = {
			version: '1.0',
			updatedAt: Date.now(),
			totalSessions: existingSessions.length,
			sessions: existingSessions
		};

		const blob = new Blob([JSON.stringify(manifestData, null, 2)], {
			type: 'application/json'
		});

		console.log(`[CloudSync] Uploading updated global sessions_manifest.json (${existingSessions.length} sessions)...`);

		const uploadedUrl = await uploadToCloudinary(blob, 'raw', cleanCloud, cleanPreset, {
			folder: 'chekiyuume',
			publicId: 'sessions_manifest.json',
			fileName: 'sessions_manifest.json',
			overwrite: true,
			tags: ['chekiyuume', 'sessions_manifest', 'database']
		});

		if (typeof localStorage !== 'undefined' && uploadedUrl) {
			localStorage.setItem('cheki_last_sessions_manifest_url', uploadedUrl);
		}
		console.log('[CloudSync] ✓ Global sessions manifest updated successfully! URL:', uploadedUrl);
	} catch (err) {
		console.error('[CloudSync] ✗ Failed to update global sessions manifest:', err);
	}
}

export interface BackupSessionsResult {
	success: boolean;
	count: number;
	skippedCount: number;
	total: number;
	manifestUrl?: string;
	error?: string;
}

/**
 * Uploads/syncs local sessions to Cloudinary, uploads per-session manifest.json,
 * automatically skips sessions already in the cloud, and updates sessions_manifest.json.
 */
export async function backupAllSessionsToCloudinary(
	sessions: SessionData[],
	cloudName: string,
	uploadPreset: string,
	onProgress?: (current: number, total: number, name?: string) => void,
	options: { skipAlreadyUploaded?: boolean } = { skipAlreadyUploaded: true }
): Promise<BackupSessionsResult> {
	try {
		const cleanCloud = cloudName.trim();
		const cleanPreset = uploadPreset.trim();
		if (!cleanCloud || !cleanPreset) {
			throw new Error('Cloud Name dan Upload Preset Cloudinary belum diatur.');
		}

		if (sessions.length === 0) {
			return { success: false, count: 0, skippedCount: 0, total: 0, error: 'Tidak ada sesi untuk dicadangkan.' };
		}

		console.log(`[CloudBackup] Starting backup for ${sessions.length} sessions to cloud "${cleanCloud}"...`);

		// 1. Fetch existing remote manifest if any
		let remoteSessions: CloudSessionSummary[] = [];
		try {
			const res = await retrieveSessionsFromCloudinary(cleanCloud);
			if (res.success && res.sessions) {
				remoteSessions = res.sessions;
				console.log(`[CloudBackup] Found ${remoteSessions.length} existing sessions in remote manifest.`);
			}
		} catch (rErr) {
			console.warn('[CloudBackup] Existing manifest retrieval warning:', rErr);
		}

		const remoteMap = new Map<string, CloudSessionSummary>();
		remoteSessions.forEach((s) => remoteMap.set(s.sessionId, s));

		const skipExisting = options.skipAlreadyUploaded !== false;
		let uploadedCount = 0;
		let skippedCount = 0;

		// 2. Process sessions
		for (let i = 0; i < sessions.length; i++) {
			const session = sessions[i];
			const guestLabel = session.guestName || session.sessionId.slice(-6);

			let photoUrl = session.cloudPhotoUrl || null;
			let videoUrl = session.cloudVideoUrl || null;
			let shareUrl = session.cloudShareUrl || `${window.location.origin}/share/${session.sessionId}`;

			const existingRemote = remoteMap.get(session.sessionId);
			if (existingRemote) {
				if (!photoUrl && existingRemote.photoUrl) photoUrl = existingRemote.photoUrl;
				if (!videoUrl && existingRemote.videoUrl) videoUrl = existingRemote.videoUrl;
				if (!session.cloudShareUrl && existingRemote.shareUrl) shareUrl = existingRemote.shareUrl;
			}

			// If already uploaded and skip is requested, skip uploading media files
			const isAlreadyInCloud = Boolean(
				session.cloudUploadStatus === 'success' && photoUrl
			);

			if (skipExisting && isAlreadyInCloud) {
				skippedCount++;
				console.log(`[CloudBackup] [${i + 1}/${sessions.length}] Skipping already uploaded session: ${session.sessionId} (${guestLabel})`);
				remoteMap.set(session.sessionId, {
					sessionId: session.sessionId,
					guestName: session.guestName,
					mode: session.mode,
					layoutId: session.layoutId,
					photoUrl: photoUrl || undefined,
					videoUrl: videoUrl || undefined,
					shareUrl,
					manifestUrl: existingRemote?.manifestUrl,
					createdAt: session.createdAt || Date.now()
				});
				if (onProgress) onProgress(i + 1, sessions.length, `(Dilewati) ${guestLabel}`);
				continue;
			}

			console.log(`[CloudBackup] [${i + 1}/${sessions.length}] Uploading session: ${session.sessionId} (${guestLabel})...`);
			if (onProgress) onProgress(i + 1, sessions.length, `Mengunggah ${guestLabel}...`);

			const sanitizedGuestName = session.guestName
				? session.guestName
						.trim()
						.toLowerCase()
						.replace(/[^a-z0-9_-]/g, '_')
						.replace(/_+/g, '_')
						.slice(0, 30)
				: 'guest';
			const sessionFolder = `chekiyuume/sessions/${sanitizedGuestName}_${session.sessionId}`;

			// Upload photostrip if not already uploaded
			if (!photoUrl && (session.photostripBlob || session.photostripDataUrl)) {
				try {
					let blobToUpload: Blob | null = session.photostripBlob || null;
					if (!blobToUpload && session.photostripDataUrl) {
						const res = await fetch(session.photostripDataUrl);
						blobToUpload = await res.blob();
					}

					if (blobToUpload) {
						photoUrl = await uploadToCloudinary(
							blobToUpload,
							'image',
							cleanCloud,
							cleanPreset,
							{
								folder: sessionFolder,
								publicId: `photostrip_${session.sessionId}`,
								fileName: `photostrip_${session.sessionId}.png`,
								tags: ['chekiyuume', 'session', 'photostrip', session.sessionId, sanitizedGuestName]
							}
						);
					}
				} catch (uploadErr) {
					console.warn(`[CloudBackup] Failed to upload photostrip for session ${session.sessionId}:`, uploadErr);
				}
			}

			// Upload videostrip if available and not uploaded
			if (!videoUrl && session.videostripBlob) {
				try {
					videoUrl = await uploadToCloudinary(
						session.videostripBlob,
						'video',
						cleanCloud,
						cleanPreset,
						{
							folder: sessionFolder,
							publicId: `videostrip_${session.sessionId}`,
							fileName: `videostrip_${session.sessionId}.mp4`,
							tags: ['chekiyuume', 'session', 'videostrip', session.sessionId, sanitizedGuestName]
						}
					);
				} catch (vidErr) {
					console.warn(`[CloudBackup] Failed to upload videostrip for session ${session.sessionId}:`, vidErr);
				}
			}

			// Upload per-session manifest.json into the session folder
			let sessionManifestUrl: string | undefined = undefined;
			try {
				const sessionManifestData = {
					sessionId: session.sessionId,
					guestName: session.guestName || '',
					createdAt: session.createdAt || Date.now(),
					mode: session.mode,
					layoutId: session.layoutId,
					photoUrl: photoUrl || undefined,
					videoUrl: videoUrl || undefined,
					shareUrl,
					printCount: session.printCount || 0
				};
				const manifestBlob = new Blob([JSON.stringify(sessionManifestData, null, 2)], {
					type: 'application/json'
				});
				sessionManifestUrl = await uploadToCloudinary(
					manifestBlob,
					'raw',
					cleanCloud,
					cleanPreset,
					{
						folder: sessionFolder,
						publicId: 'manifest.json',
						fileName: 'manifest.json',
						overwrite: true,
						tags: ['chekiyuume', 'session_manifest', session.sessionId, sanitizedGuestName]
					}
				);
			} catch (mErr) {
				console.warn(`[CloudBackup] Failed to upload manifest for session ${session.sessionId}:`, mErr);
			}

			// Update session in local IndexedDB so it marks cloud status immediately
			session.cloudPhotoUrl = photoUrl || session.cloudPhotoUrl || null;
			session.cloudVideoUrl = videoUrl || session.cloudVideoUrl || null;
			session.cloudShareUrl = shareUrl || session.cloudShareUrl || null;
			session.cloudUploadStatus = photoUrl ? 'success' : session.cloudUploadStatus;
			await saveSessionToDB(session);

			remoteMap.set(session.sessionId, {
				sessionId: session.sessionId,
				guestName: session.guestName,
				mode: session.mode,
				layoutId: session.layoutId,
				photoUrl: photoUrl || undefined,
				videoUrl: videoUrl || undefined,
				shareUrl,
				manifestUrl: sessionManifestUrl,
				createdAt: session.createdAt || Date.now()
			});

			uploadedCount++;
		}

		// Convert remoteMap back to sorted array (newest first)
		const mergedSessions = Array.from(remoteMap.values()).sort((a, b) => b.createdAt - a.createdAt);

		const manifestData = {
			version: '1.0',
			updatedAt: Date.now(),
			totalSessions: mergedSessions.length,
			sessions: mergedSessions.slice(0, 500)
		};

		const blob = new Blob([JSON.stringify(manifestData, null, 2)], {
			type: 'application/json'
		});

		console.log(`[CloudBackup] Uploading final global sessions_manifest.json with ${mergedSessions.length} total sessions...`);

		const globalManifestUrl = await uploadToCloudinary(blob, 'raw', cleanCloud, cleanPreset, {
			folder: 'chekiyuume',
			publicId: 'sessions_manifest.json',
			fileName: 'sessions_manifest.json',
			overwrite: true,
			tags: ['chekiyuume', 'sessions_manifest', 'database']
		});

		if (typeof localStorage !== 'undefined' && globalManifestUrl) {
			localStorage.setItem('cheki_last_sessions_manifest_url', globalManifestUrl);
		}

		console.log('[CloudBackup] ✓ Backup complete! Uploaded:', uploadedCount, 'Skipped:', skippedCount, 'Manifest:', globalManifestUrl);

		return {
			success: true,
			count: uploadedCount,
			skippedCount,
			total: mergedSessions.length,
			manifestUrl: globalManifestUrl
		};
	} catch (err: any) {
		console.error('[CloudBackup] ✗ backupAllSessionsToCloudinary failed:', err);
		return {
			success: false,
			count: 0,
			skippedCount: 0,
			total: 0,
			error: err?.message || String(err)
		};
	}
}

/**
 * Retrieves all sessions from Cloudinary sessions_manifest.json with multiple URL fallbacks
 */
export async function retrieveSessionsFromCloudinary(
	cloudName: string
): Promise<{ success: boolean; sessions: CloudSessionSummary[]; count: number; error?: string }> {
	try {
		const cleanCloud = cloudName.trim();
		if (!cleanCloud) {
			throw new Error('Cloud Name Cloudinary belum diatur.');
		}

		console.log(`[CloudRetrieve] Starting retrieval of sessions manifest from Cloudinary: "${cleanCloud}"...`);

		// Try multiple URL variants to overcome Cloudinary raw naming discrepancies & versions
		const candidateUrls: string[] = [
			`/api/manifest?type=sessions&_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/sessions_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions_manifest?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/sessions_manifest?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/sessions_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/sessions_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions_manifest.json.json?_t=${Date.now()}`
		];

		if (typeof localStorage !== 'undefined') {
			const cachedUrl = localStorage.getItem('cheki_last_sessions_manifest_url');
			if (cachedUrl) {
				const unversionedCached = cachedUrl.replace(/\/raw\/upload\/v[0-9]+\//, '/raw/upload/');
				const separator = unversionedCached.includes('?') ? '&' : '?';
				candidateUrls.push(`${unversionedCached}${separator}_t=${Date.now()}`);
			}
		}

		let data: any = null;
		let lastStatus = 0;
		const testedResults: { url: string; status: number; error?: string }[] = [];

		for (let idx = 0; idx < candidateUrls.length; idx++) {
			const url = candidateUrls[idx];
			try {
				console.log(`[CloudRetrieve] [${idx + 1}/${candidateUrls.length}] Testing URL: ${url}`);
				const res = await fetch(url, {
					cache: 'no-store',
					headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Accept': 'application/json' }
				});
				lastStatus = res.status;
				console.log(`[CloudRetrieve] -> HTTP ${res.status} ${res.statusText}`);
				testedResults.push({ url, status: res.status });

				if (res.ok) {
					const json = await res.json();
					if (json && Array.isArray(json.sessions)) {
						data = json;
						console.log(`[CloudRetrieve] ✓ Manifest found and parsed from: ${url}! Sessions count: ${json.sessions.length}`);
						if (typeof localStorage !== 'undefined') {
							localStorage.setItem('cheki_last_sessions_manifest_url', url.split('?')[0]);
						}
						break;
					} else {
						console.warn(`[CloudRetrieve] JSON at ${url} is valid JSON but does not contain a "sessions" array:`, json);
					}
				}
			} catch (fetchErr: any) {
				console.warn(`[CloudRetrieve] Fetch failed for ${url}:`, fetchErr?.message || fetchErr);
				testedResults.push({ url, status: 0, error: fetchErr?.message || String(fetchErr) });
			}
		}

		if (!data) {
			console.error(`[CloudRetrieve] ✗ All ${candidateUrls.length} candidate URLs failed for cloud "${cleanCloud}":`, testedResults);
			return {
				success: false,
				sessions: [],
				count: 0,
				error: `Manifest sesi (${cleanCloud}/chekiyuume/sessions_manifest.json) belum ditemukan di Cloudinary (HTTP ${lastStatus || 404}). Pastikan sudah melakukan "Backup ke Cloud" terlebih dahulu atau gunakan fitur "Tarik Sesi via ID / Manifest".`
			};
		}

		return {
			success: true,
			sessions: data.sessions,
			count: data.sessions.length
		};
	} catch (err: any) {
		console.error('[CloudRetrieve] ✗ Retrieve sessions from Cloudinary failed:', err);
		return {
			success: false,
			sessions: [],
			count: 0,
			error: err?.message || String(err)
		};
	}
}

/**
 * Retrieves a single session directly by reading its manifest.json URL or searching its Cloudinary folder
 */
export async function retrieveSessionBySessionId(
	sessionQuery: string,
	cloudName: string,
	guestName?: string
): Promise<{ success: boolean; session?: CloudSessionSummary; error?: string }> {
	try {
		const cleanCloud = cloudName.trim();
		const cleanQuery = sessionQuery.trim();
		if (!cleanCloud) throw new Error('Cloud Name Cloudinary belum diisi.');
		if (!cleanQuery) throw new Error('ID Sesi atau nama folder belum diisi.');

		console.log(`[CloudPull] Searching for session "${cleanQuery}" (guest: "${guestName || ''}") on cloud "${cleanCloud}"...`);

		// If user passed a full manifest URL directly
		if (cleanQuery.startsWith('http://') || cleanQuery.startsWith('https://')) {
			console.log(`[CloudPull] Query is a direct manifest URL: ${cleanQuery}`);
			return await retrieveSessionFromManifestUrl(cleanQuery);
		}

		// Candidate folder paths
		const candidateFolders: string[] = [];
		if (guestName?.trim()) {
			const cleanGuest = guestName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 30);
			candidateFolders.push(`${cleanGuest}_${cleanQuery}`);
		}
		if (cleanQuery.includes('_')) {
			candidateFolders.push(cleanQuery);
		}
		candidateFolders.push(`guest_${cleanQuery}`);
		candidateFolders.push(cleanQuery);

		console.log(`[CloudPull] Testing folder candidates:`, candidateFolders);

		const testedUrls: { url: string; status: number }[] = [];

		for (const folder of candidateFolders) {
			const candidateUrls = [
				`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions/${folder}/manifest.json?_t=${Date.now()}`,
				`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/sessions/${folder}/manifest.json?_t=${Date.now()}`,
				`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions/${folder}/manifest?_t=${Date.now()}`,
				`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/sessions/${folder}/manifest?_t=${Date.now()}`
			];

			for (const mUrl of candidateUrls) {
				try {
					console.log(`[CloudPull] Checking candidate: ${mUrl}`);
					const res = await fetch(mUrl, {
						cache: 'no-store',
						headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' }
					});
					testedUrls.push({ url: mUrl, status: res.status });
					console.log(`[CloudPull] -> HTTP ${res.status}`);

					if (res.ok) {
						const manifestData = await res.json();
						if (manifestData && (manifestData.sessionId || manifestData.photoUrl)) {
							console.log('[CloudPull] ✓ Session manifest found & parsed:', manifestData);
							return {
								success: true,
								session: {
									sessionId: manifestData.sessionId || cleanQuery,
									guestName: manifestData.guestName || '',
									mode: manifestData.mode || 'default',
									layoutId: manifestData.layoutId || 'default-4-classic',
									photoUrl: manifestData.photoUrl,
									videoUrl: manifestData.videoUrl,
									shareUrl: manifestData.shareUrl,
									manifestUrl: mUrl,
									createdAt: manifestData.createdAt || Date.now()
								}
							};
						}
					}
				} catch (fetchErr: any) {
					console.warn(`[CloudPull] Fetch error at ${mUrl}:`, fetchErr?.message || fetchErr);
				}
			}
		}

		console.error(`[CloudPull] ✗ Session "${cleanQuery}" not found in any tested candidates:`, testedUrls);
		return {
			success: false,
			error: `Manifest untuk sesi "${cleanQuery}" tidak ditemukan di folder chekiyuume/sessions/ pada Cloudinary ${cleanCloud}. Periksa console (F12) untuk detail URL yang diuji.`
		};
	} catch (err: any) {
		console.error('[CloudPull] ✗ retrieveSessionBySessionId failed:', err);
		return {
			success: false,
			error: err?.message || String(err)
		};
	}
}

/**
 * Downloads and parses any manifest.json URL into a CloudSessionSummary
 */
export async function retrieveSessionFromManifestUrl(
	url: string
): Promise<{ success: boolean; session?: CloudSessionSummary; error?: string }> {
	try {
		console.log(`[CloudManifest] Fetching manifest from URL: ${url}`);
		const res = await fetch(url, {
			cache: 'no-store',
			headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' }
		});
		console.log(`[CloudManifest] -> HTTP ${res.status}`);
		if (!res.ok) {
			throw new Error(`Gagal mengunduh manifest dari URL (HTTP ${res.status})`);
		}
		const data = await res.json();
		if (!data || (!data.sessionId && !data.photoUrl)) {
			throw new Error('Format berkas JSON bukan manifest sesi ChekiYuume yang valid.');
		}
		console.log('[CloudManifest] ✓ Successfully loaded manifest:', data);
		return {
			success: true,
			session: {
				sessionId: data.sessionId || `cloud_${Date.now()}`,
				guestName: data.guestName || '',
				mode: data.mode || 'default',
				layoutId: data.layoutId || 'default-4-classic',
				photoUrl: data.photoUrl,
				videoUrl: data.videoUrl,
				shareUrl: data.shareUrl,
				manifestUrl: url,
				createdAt: data.createdAt || Date.now()
			}
		};
	} catch (err: any) {
		console.error('[CloudManifest] ✗ Failed to load manifest from URL:', err);
		return {
			success: false,
			error: err?.message || String(err)
		};
	}
}
