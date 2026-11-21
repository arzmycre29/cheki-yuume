import QRCode from 'qrcode';
import type { SessionData, KioskSettings, FrameLayout } from '$lib/types';
import { saveSessionToDB } from '$lib/services/db';

function getAdminPinFromStorage(explicitPin?: string): string {
	if (explicitPin && explicitPin.trim()) return explicitPin.trim();
	let adminPin = '0509';
	if (typeof localStorage !== 'undefined') {
		try {
			const raw = localStorage.getItem('chekiyuume_kiosk_settings');
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed?.adminPin) adminPin = String(parsed.adminPin).trim();
			}
		} catch (_) {}
	}
	return adminPin || '0509';
}

function sanitizeGuestName(guestName?: string): string {
	return guestName
		? guestName
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9_-]/g, '_')
				.replace(/_+/g, '_')
				.slice(0, 30) || 'guest'
		: 'guest';
}

function normalizeFrameName(name: string): string {
	return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function generateQrCodeDataUrl(text: string): Promise<string> {
	try {
		let cleanText = text;
		if (text.startsWith('http://') || text.startsWith('https://')) {
			try {
				const url = new URL(text);
				cleanText = `${url.origin}${url.pathname}`;
			} catch (_) {
				cleanText = text.split('?')[0];
			}
		}
		return await QRCode.toDataURL(cleanText, {
			width: 320,
			margin: 2,
			color: {
				dark: '#000000',
				light: '#ffffff'
			},
			errorCorrectionLevel: 'L'
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

	const cleanFolder = options.folder ? options.folder.replace(/^\/+|\/+$/g, '') : undefined;
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
					console.log('[CloudUpload] ✓ Signed signature received from Cloudflare Pages Function');
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

export interface CloudSessionSummary {
	sessionId: string;
	guestName?: string;
	mode: string;
	layoutId: string;
	photoUrl?: string;
	videoUrl?: string;
	shareUrl?: string;
	manifestUrl?: string;
	photosCount?: number;
	printCount?: number;
	createdAt: number;
}

/**
 * Saves one or multiple session metadata entries atomically to Cloudflare D1 via /api/sessions.
 */
export async function saveSessionToCloudDB(
	sessionOrList: CloudSessionSummary | CloudSessionSummary[]
): Promise<{ success: boolean; d1Unavailable?: boolean; count?: number; error?: string }> {
	try {
		const payload = Array.isArray(sessionOrList)
			? { sessions: sessionOrList }
			: sessionOrList;

		const res = await fetch('/api/sessions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (res.status === 503 || res.status === 404) {
			const body = await res.json().catch(() => ({}));
			return {
				success: false,
				d1Unavailable: true,
				error: body?.error || `HTTP ${res.status}`
			};
		}

		const data = await res.json().catch(() => ({}));
		if (!res.ok || !data?.success) {
			return {
				success: false,
				error: data?.error || `HTTP ${res.status}`
			};
		}

		return {
			success: true,
			count: data.count ?? (Array.isArray(sessionOrList) ? sessionOrList.length : 1)
		};
	} catch (err: any) {
		return {
			success: false,
			d1Unavailable: true,
			error: err?.message || String(err)
		};
	}
}

/**
 * Uploads photostrip & videostrip in parallel to Cloudinary and stores session metadata in Cloudflare D1.
 */
export async function uploadSessionToCloud(
	session: SessionData,
	settings: KioskSettings
): Promise<{ photoUrl: string | null; videoUrl: string | null; shareUrl: string }> {
	const fallbackShareUrl = `${window.location.origin}/share/${session.sessionId}`;

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

		const sanitizedGuest = sanitizeGuestName(session.guestName);
		const sessionFolder = `chekiyuume/sessions/${sanitizedGuest}_${session.sessionId}`;

		try {
			// 1. Parallel upload: Photostrip (image) + Videostrip (video) simultaneously
			const photoUploadPromise = (async (): Promise<string | null> => {
				if (session.photostripBlob) {
					return await uploadToCloudinary(
						session.photostripBlob,
						'image',
						cloudName,
						uploadPreset,
						{
							folder: sessionFolder,
							publicId: `photostrip_${session.sessionId}`,
							fileName: `photostrip_${session.sessionId}.png`,
							tags: ['chekiyuume', 'session', 'photostrip', session.sessionId, sanitizedGuest]
						}
					);
				}
				if (session.photostripDataUrl) {
					const res = await fetch(session.photostripDataUrl);
					const blob = await res.blob();
					return await uploadToCloudinary(blob, 'image', cloudName, uploadPreset, {
						folder: sessionFolder,
						publicId: `photostrip_${session.sessionId}`,
						fileName: `photostrip_${session.sessionId}.png`,
						tags: ['chekiyuume', 'session', 'photostrip', session.sessionId, sanitizedGuest]
					});
				}
				return null;
			})();

			const videoUploadPromise = (async (): Promise<string | null> => {
				if (!session.videostripBlob) return null;
				try {
					return await uploadToCloudinary(
						session.videostripBlob,
						'video',
						cloudName,
						uploadPreset,
						{
							folder: sessionFolder,
							publicId: `videostrip_${session.sessionId}`,
							fileName: `videostrip_${session.sessionId}.mp4`,
							tags: ['chekiyuume', 'session', 'videostrip', session.sessionId, sanitizedGuest]
						}
					);
				} catch (vidErr) {
					console.warn('[Cloudinary] Videostrip upload failed (continuing with photostrip):', vidErr);
					return null;
				}
			})();

			const [photoUrl, videoUrl] = await Promise.all([photoUploadPromise, videoUploadPromise]);

			// Construct Share Page URL
			const basePublicUrl = settings.cloudPublicBaseUrl?.trim() || window.location.origin;
			const shareParams = new URLSearchParams();
			if (photoUrl) shareParams.set('p', photoUrl);
			if (videoUrl) shareParams.set('v', videoUrl);
			if (session.guestName) shareParams.set('n', session.guestName);

			const queryString = shareParams.toString();
			const shareUrl = `${basePublicUrl}/share/${session.sessionId}${queryString ? `?${queryString}` : ''}`;

			const summary: CloudSessionSummary = {
				sessionId: session.sessionId,
				guestName: session.guestName,
				mode: session.mode,
				layoutId: session.layoutId,
				photoUrl: photoUrl || undefined,
				videoUrl: videoUrl || undefined,
				shareUrl,
				photosCount: session.photos?.length || session.photosCount || 4,
				printCount: session.printCount || 0,
				createdAt: session.createdAt || Date.now()
			};

			// 2. Persist metadata atomically to Cloudflare D1
			const dbResult = await saveSessionToCloudDB(summary);
			if (dbResult.success) {
				console.log(`[CloudDB] ✓ Session "${session.sessionId}" saved to Cloudflare D1.`);
			} else if (dbResult.d1Unavailable) {
				// Fallback to legacy Cloudinary manifest only when D1 binding is unavailable (e.g., local vite dev)
				console.warn('[CloudDB] D1 unavailable, falling back to legacy Cloudinary manifest:', dbResult.error);
				await recordSessionToCloudinaryManifest(summary, cloudName, uploadPreset).catch(() => {});
			} else {
				console.warn('[CloudDB] Failed to save session to D1:', dbResult.error);
			}

			return {
				photoUrl,
				videoUrl,
				shareUrl
			};
		} catch (err) {
			console.error('[Cloudinary] Upload failed, using fallback:', err);
			return {
				photoUrl: null,
				videoUrl: null,
				shareUrl: fallbackShareUrl
			};
		}
	}

	if (settings.cloudProvider === 'none' || !settings.cloudEndpoint) {
		return {
			photoUrl: null,
			videoUrl: null,
			shareUrl: fallbackShareUrl
		};
	}

	try {
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
	const sanitizedName = sanitizeGuestName(frameName) || 'frame';
	const uniqueId = `frame_${sanitizedName}_${Date.now()}`;

	return await uploadToCloudinary(file, 'image', cloudName, uploadPreset, {
		folder: 'chekiyuume/frames',
		publicId: uniqueId,
		fileName: `${uniqueId}.png`,
		tags: ['chekiyuume', 'frame', 'custom_frame', sanitizedName]
	});
}

function deduplicateCustomFrames(frames: FrameLayout[]): FrameLayout[] {
	const customOnly = frames.filter((f) => f.id.startsWith('custom-'));
	const seen = new Set<string>();
	const dedupedCustom: FrameLayout[] = [];
	for (const f of customOnly) {
		const norm = normalizeFrameName(f.name);
		if (!seen.has(norm)) {
			seen.add(norm);
			dedupedCustom.push(f);
		}
	}
	return dedupedCustom;
}

/**
 * Saves custom frame templates to Cloudflare D1 (with legacy Cloudinary manifest fallback if D1 unavailable).
 */
export async function backupCustomFramesToCloudDB(
	frames: FrameLayout[],
	adminPin?: string,
	fallbackCloudinary?: { cloudName?: string; uploadPreset?: string }
): Promise<{ success: boolean; url?: string; count: number; error?: string }> {
	try {
		const dedupedCustom = deduplicateCustomFrames(frames);
		const pin = getAdminPinFromStorage(adminPin);

		const res = await fetch('/api/frames', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-admin-pin': pin
			},
			body: JSON.stringify({
				frames: dedupedCustom,
				replaceAll: true
			})
		});

		if (res.ok) {
			const data = await res.json();
			if (data?.success) {
				return {
					success: true,
					count: dedupedCustom.length
				};
			}
		}

		// Legacy Cloudinary fallback when D1 is unavailable (404/503 in local vite dev)
		if (
			(res.status === 503 || res.status === 404) &&
			fallbackCloudinary?.cloudName?.trim() &&
			fallbackCloudinary?.uploadPreset?.trim()
		) {
			const manifestData = {
				version: '1.0',
				updatedAt: Date.now(),
				totalCustomFrames: dedupedCustom.length,
				frames: dedupedCustom
			};
			const blob = new Blob([JSON.stringify(manifestData, null, 2)], {
				type: 'application/json'
			});
			const manifestUrl = await uploadToCloudinary(
				blob,
				'raw',
				fallbackCloudinary.cloudName.trim(),
				fallbackCloudinary.uploadPreset.trim(),
				{
					folder: 'chekiyuume',
					publicId: 'frames_manifest.json',
					fileName: 'frames_manifest.json',
					overwrite: true,
					tags: ['chekiyuume', 'frames_manifest', 'backup']
				}
			);
			if (typeof localStorage !== 'undefined' && manifestUrl) {
				localStorage.setItem('cheki_last_frames_manifest_url', manifestUrl);
			}
			return {
				success: true,
				url: manifestUrl,
				count: dedupedCustom.length
			};
		}

		const errData = await res.json().catch(() => ({}));
		throw new Error(errData?.error || `Gagal menyimpan custom frames (HTTP ${res.status})`);
	} catch (err: any) {
		console.error('[Frames] Failed to backup custom frames:', err);
		return {
			success: false,
			count: 0,
			error: err?.message || String(err)
		};
	}
}

/**
 * Backward-compatible alias for saving custom frames (D1-first with optional Cloudinary fallback).
 */
export async function backupCustomFramesToCloudinary(
	frames: FrameLayout[],
	cloudName: string,
	uploadPreset: string,
	adminPin?: string
): Promise<{ success: boolean; url?: string; count: number; error?: string }> {
	return await backupCustomFramesToCloudDB(frames, adminPin, { cloudName, uploadPreset });
}

/**
 * Deletes a single custom frame or clears all custom frames in Cloudflare D1.
 */
export async function deleteCustomFrameFromCloudDB(
	frameId: string,
	adminPin?: string
): Promise<boolean> {
	try {
		const pin = getAdminPinFromStorage(adminPin);
		const res = await fetch(`/api/frames?id=${encodeURIComponent(frameId)}`, {
			method: 'DELETE',
			headers: { 'x-admin-pin': pin }
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function clearCustomFramesInCloudDB(adminPin?: string): Promise<boolean> {
	try {
		const pin = getAdminPinFromStorage(adminPin);
		const res = await fetch('/api/frames?all=true', {
			method: 'DELETE',
			headers: { 'x-admin-pin': pin }
		});
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Retrieves custom frame templates from Cloudflare D1 (with legacy Cloudinary manifest fallback).
 */
export async function retrieveCustomFramesFromCloudDB(
	cloudName?: string
): Promise<{ success: boolean; frames: FrameLayout[]; count: number; error?: string }> {
	try {
		try {
			const res = await fetch(`/api/frames?_t=${Date.now()}`, {
				cache: 'no-store',
				headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' }
			});
			if (res.ok) {
				const json = await res.json();
				if (json && Array.isArray(json.frames)) {
					return {
						success: true,
						frames: json.frames,
						count: json.frames.length
					};
				}
			}
		} catch (apiErr) {
			console.warn('[FramesRetrieve] /api/frames fetch warning:', apiErr);
		}

		// Legacy Cloudinary fallback if /api/frames is unreachable (e.g., pure static dev server)
		const cleanCloud = (cloudName || '').trim();
		if (!cleanCloud) {
			return {
				success: false,
				frames: [],
				count: 0,
				error: 'Belum dapat mengakses database frame (/api/frames).'
			};
		}

		const candidateUrls: string[] = [
			`/api/manifest?type=frames&_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/frames_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/frames_manifest.json?_t=${Date.now()}`
		];

		for (const url of candidateUrls) {
			try {
				const res = await fetch(url, {
					cache: 'no-store',
					headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' }
				});
				if (res.ok) {
					const json = await res.json();
					if (json && Array.isArray(json.frames)) {
						return {
							success: true,
							frames: json.frames,
							count: json.frames.length
						};
					}
				}
			} catch (_) {}
		}

		return {
			success: false,
			frames: [],
			count: 0,
			error: 'Belum ada custom frame tersimpan di Cloud / D1.'
		};
	} catch (err: any) {
		return {
			success: false,
			frames: [],
			count: 0,
			error: err?.message || String(err)
		};
	}
}

/**
 * Backward-compatible alias for retrieving custom frames (D1-first with legacy fallback).
 */
export async function retrieveCustomFramesFromCloudinary(
	cloudName?: string
): Promise<{ success: boolean; frames: FrameLayout[]; count: number; error?: string }> {
	return await retrieveCustomFramesFromCloudDB(cloudName);
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

/**
 * Legacy fallback: appends a session entry into Cloudinary sessions_manifest.json.
 * Only invoked if Cloudflare D1 binding is unavailable.
 */
export async function recordSessionToCloudinaryManifest(
	session: CloudSessionSummary,
	cloudName: string,
	uploadPreset: string
): Promise<void> {
	try {
		const cleanCloud = cloudName.trim();
		const cleanPreset = uploadPreset.trim();
		if (!cleanCloud || !cleanPreset) return;

		let existingSessions: CloudSessionSummary[] = [];
		const adminPin = getAdminPinFromStorage();
		const candidateUrls = [
			`/api/manifest?type=sessions&pin=${encodeURIComponent(adminPin)}&_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions_manifest.json?_t=${Date.now()}`
		];

		for (const url of candidateUrls) {
			try {
				const res = await fetch(url, {
					cache: 'no-store',
					headers: { Accept: 'application/json', 'x-admin-pin': adminPin }
				});
				if (res.ok) {
					const data = await res.json();
					if (Array.isArray(data?.sessions)) {
						existingSessions = data.sessions;
						break;
					}
				}
			} catch (_) {}
		}

		existingSessions = existingSessions.filter((s) => s.sessionId !== session.sessionId);
		existingSessions.unshift(session);
		if (existingSessions.length > 500) {
			existingSessions = existingSessions.slice(0, 500);
		}

		const blob = new Blob(
			[
				JSON.stringify(
					{
						version: '1.0',
						updatedAt: Date.now(),
						totalSessions: existingSessions.length,
						sessions: existingSessions
					},
					null,
					2
				)
			],
			{ type: 'application/json' }
		);

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
	} catch (err) {
		console.error('[CloudSync] Legacy manifest fallback error:', err);
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
 * Uploads local sessions' media (photostrip & videostrip in parallel) to Cloudinary,
 * skips sessions already uploaded, and batch-saves metadata to Cloudflare D1.
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
			return {
				success: false,
				count: 0,
				skippedCount: 0,
				total: 0,
				error: 'Tidak ada sesi untuk dicadangkan.'
			};
		}

		// 1. Fetch existing remote sessions from D1 (or legacy manifest fallback)
		let remoteSessions: CloudSessionSummary[] = [];
		try {
			const res = await retrieveSessionsFromCloudinary(cleanCloud);
			if (res.success && res.sessions) {
				remoteSessions = res.sessions;
			}
		} catch (rErr) {
			console.warn('[CloudBackup] Existing sessions retrieval warning:', rErr);
		}

		const remoteMap = new Map<string, CloudSessionSummary>();
		remoteSessions.forEach((s) => remoteMap.set(s.sessionId, s));

		const skipExisting = options.skipAlreadyUploaded !== false;
		let uploadedCount = 0;
		let skippedCount = 0;
		const summariesToSyncToD1: CloudSessionSummary[] = [];

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

			const isAlreadyInCloud = Boolean(session.cloudUploadStatus === 'success' && photoUrl);

			if (skipExisting && isAlreadyInCloud) {
				skippedCount++;
				const summary: CloudSessionSummary = {
					sessionId: session.sessionId,
					guestName: session.guestName,
					mode: session.mode,
					layoutId: session.layoutId,
					photoUrl: photoUrl || undefined,
					videoUrl: videoUrl || undefined,
					shareUrl,
					manifestUrl: existingRemote?.manifestUrl,
					photosCount: session.photos?.length || session.photosCount || existingRemote?.photosCount || 4,
					printCount: session.printCount || existingRemote?.printCount || 0,
					createdAt: session.createdAt || Date.now()
				};
				remoteMap.set(session.sessionId, summary);
				if (!existingRemote) {
					summariesToSyncToD1.push(summary);
				}
				if (onProgress) onProgress(i + 1, sessions.length, `(Dilewati) ${guestLabel}`);
				continue;
			}

			if (onProgress) onProgress(i + 1, sessions.length, `Mengunggah ${guestLabel}...`);

			const sanitizedGuest = sanitizeGuestName(session.guestName);
			const sessionFolder = `chekiyuume/sessions/${sanitizedGuest}_${session.sessionId}`;

			// Parallel upload for missing photostrip and videostrip
			const photoPromise = (async (): Promise<string | null> => {
				if (photoUrl) return photoUrl;
				if (!session.photostripBlob && !session.photostripDataUrl) return null;
				try {
					let blobToUpload: Blob | null = session.photostripBlob || null;
					if (!blobToUpload && session.photostripDataUrl) {
						const res = await fetch(session.photostripDataUrl);
						blobToUpload = await res.blob();
					}
					if (!blobToUpload) return null;
					return await uploadToCloudinary(blobToUpload, 'image', cleanCloud, cleanPreset, {
						folder: sessionFolder,
						publicId: `photostrip_${session.sessionId}`,
						fileName: `photostrip_${session.sessionId}.png`,
						tags: ['chekiyuume', 'session', 'photostrip', session.sessionId, sanitizedGuest]
					});
				} catch (uploadErr) {
					console.warn(`[CloudBackup] Failed to upload photostrip for ${session.sessionId}:`, uploadErr);
					return null;
				}
			})();

			const videoPromise = (async (): Promise<string | null> => {
				if (videoUrl) return videoUrl;
				if (!session.videostripBlob) return null;
				try {
					return await uploadToCloudinary(session.videostripBlob, 'video', cleanCloud, cleanPreset, {
						folder: sessionFolder,
						publicId: `videostrip_${session.sessionId}`,
						fileName: `videostrip_${session.sessionId}.mp4`,
						tags: ['chekiyuume', 'session', 'videostrip', session.sessionId, sanitizedGuest]
					});
				} catch (vidErr) {
					console.warn(`[CloudBackup] Failed to upload videostrip for ${session.sessionId}:`, vidErr);
					return null;
				}
			})();

			const [uploadedPhotoUrl, uploadedVideoUrl] = await Promise.all([photoPromise, videoPromise]);
			photoUrl = uploadedPhotoUrl;
			videoUrl = uploadedVideoUrl;

			// Update local IndexedDB
			session.cloudPhotoUrl = photoUrl || session.cloudPhotoUrl || null;
			session.cloudVideoUrl = videoUrl || session.cloudVideoUrl || null;
			session.cloudShareUrl = shareUrl || session.cloudShareUrl || null;
			session.cloudUploadStatus = photoUrl ? 'success' : session.cloudUploadStatus;
			await saveSessionToDB(session);

			const summary: CloudSessionSummary = {
				sessionId: session.sessionId,
				guestName: session.guestName,
				mode: session.mode,
				layoutId: session.layoutId,
				photoUrl: photoUrl || undefined,
				videoUrl: videoUrl || undefined,
				shareUrl,
				photosCount: session.photos?.length || session.photosCount || 4,
				printCount: session.printCount || 0,
				createdAt: session.createdAt || Date.now()
			};
			remoteMap.set(session.sessionId, summary);
			summariesToSyncToD1.push(summary);
			uploadedCount++;
		}

		const mergedSessions = Array.from(remoteMap.values()).sort((a, b) => b.createdAt - a.createdAt);

		// 3. Batch upsert metadata to Cloudflare D1
		let fallbackManifestUrl: string | undefined = undefined;
		if (summariesToSyncToD1.length > 0) {
			const dbResult = await saveSessionToCloudDB(summariesToSyncToD1);
			if (dbResult.d1Unavailable) {
				// Fallback to legacy global manifest only if D1 binding is unavailable
				const blob = new Blob(
					[
						JSON.stringify(
							{
								version: '1.0',
								updatedAt: Date.now(),
								totalSessions: mergedSessions.length,
								sessions: mergedSessions.slice(0, 500)
							},
							null,
							2
						)
					],
					{ type: 'application/json' }
				);
				fallbackManifestUrl = await uploadToCloudinary(blob, 'raw', cleanCloud, cleanPreset, {
					folder: 'chekiyuume',
					publicId: 'sessions_manifest.json',
					fileName: 'sessions_manifest.json',
					overwrite: true,
					tags: ['chekiyuume', 'sessions_manifest', 'database']
				});
			}
		}

		return {
			success: true,
			count: uploadedCount,
			skippedCount,
			total: mergedSessions.length,
			manifestUrl: fallbackManifestUrl
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
 * Retrieves all sessions from Cloudflare D1 (with legacy Cloudinary manifest fallback if D1 unavailable).
 */
export async function retrieveSessionsFromCloudDB(
	pin?: string,
	fallbackCloudName?: string
): Promise<{ success: boolean; sessions: CloudSessionSummary[]; count: number; error?: string }> {
	try {
		const adminPin = getAdminPinFromStorage(pin);

		try {
			const res = await fetch(`/api/sessions?limit=2000&_t=${Date.now()}`, {
				cache: 'no-store',
				headers: {
					'Cache-Control': 'no-cache',
					Accept: 'application/json',
					'x-admin-pin': adminPin
				}
			});

			if (res.status === 401) {
				const errJson = await res.json().catch(() => ({}));
				return {
					success: false,
					sessions: [],
					count: 0,
					error: errJson?.error || 'PIN Admin ditolak oleh server Cloudflare (HTTP 401).'
				};
			}

			if (res.ok) {
				const json = await res.json();
				if (json?.success && Array.isArray(json.sessions)) {
					return {
						success: true,
						sessions: json.sessions,
						count: json.sessions.length
					};
				}
			}
		} catch (apiErr) {
			console.warn('[CloudRetrieve] /api/sessions fetch warning:', apiErr);
		}

		// Legacy Cloudinary fallback if /api/sessions is unreachable (e.g., pure static vite dev)
		const cleanCloud = (fallbackCloudName || '').trim();
		if (!cleanCloud) {
			return {
				success: false,
				sessions: [],
				count: 0,
				error: 'Gagal terhubung ke API /api/sessions dan Cloud Name kosong.'
			};
		}

		const candidateUrls = [
			`/api/manifest?type=sessions&pin=${encodeURIComponent(adminPin)}&_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions_manifest.json?_t=${Date.now()}`,
			`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/sessions_manifest.json?_t=${Date.now()}`
		];

		let lastStatus = 0;
		for (const url of candidateUrls) {
			try {
				const res = await fetch(url, {
					cache: 'no-store',
					headers: {
						'Cache-Control': 'no-cache',
						Accept: 'application/json',
						'x-admin-pin': adminPin
					}
				});
				lastStatus = res.status;
				if (res.ok) {
					const json = await res.json();
					const found = Array.isArray(json?.sessions)
						? json.sessions
						: Array.isArray(json)
						? json
						: null;
					if (found !== null) {
						return {
							success: true,
							sessions: found,
							count: found.length
						};
					}
				}
			} catch (_) {}
		}

		return {
			success: false,
			sessions: [],
			count: 0,
			error: `Riwayat sesi belum ditemukan di D1 atau manifest Cloudinary (HTTP ${lastStatus || 404}).`
		};
	} catch (err: any) {
		return {
			success: false,
			sessions: [],
			count: 0,
			error: err?.message || String(err)
		};
	}
}

/**
 * Backward-compatible alias for retrieving all sessions (D1-first with legacy fallback).
 */
export async function retrieveSessionsFromCloudinary(
	cloudName: string,
	pin?: string
): Promise<{ success: boolean; sessions: CloudSessionSummary[]; count: number; error?: string }> {
	return await retrieveSessionsFromCloudDB(pin, cloudName);
}

/**
 * Retrieves a single session from Cloudflare D1 first, with legacy Cloudinary folder manifest fallback.
 */
export async function retrieveSessionBySessionId(
	sessionQuery: string,
	cloudName: string,
	guestName?: string
): Promise<{ success: boolean; session?: CloudSessionSummary; error?: string }> {
	try {
		const cleanCloud = cloudName.trim();
		const cleanQuery = sessionQuery.trim();
		if (!cleanQuery) throw new Error('ID Sesi atau nama folder belum diisi.');

		if (cleanQuery.startsWith('http://') || cleanQuery.startsWith('https://')) {
			return await retrieveSessionFromManifestUrl(cleanQuery);
		}

		// 1. Fast lookup via Cloudflare D1 (/api/sessions/:id)
		try {
			const res = await fetch(`/api/sessions/${encodeURIComponent(cleanQuery)}?_t=${Date.now()}`, {
				cache: 'no-store',
				headers: { Accept: 'application/json' }
			});
			if (res.ok) {
				const data = await res.json();
				if (data?.success && data.session && (data.session.photoUrl || data.session.videoUrl)) {
					return {
						success: true,
						session: data.session
					};
				}
			}
		} catch (apiErr) {
			console.warn('[CloudPull] /api/sessions/:id lookup warning:', apiErr);
		}

		if (!cleanCloud) {
			return {
				success: false,
				error: `Sesi "${cleanQuery}" tidak ditemukan di database D1.`
			};
		}

		// 2. Fallback to legacy per-session Cloudinary manifest.json folder structure
		const candidateFolders: string[] = [];
		if (guestName?.trim()) {
			candidateFolders.push(`${sanitizeGuestName(guestName)}_${cleanQuery}`);
		}
		if (cleanQuery.includes('_')) {
			candidateFolders.push(cleanQuery);
		}
		candidateFolders.push(`guest_${cleanQuery}`);
		candidateFolders.push(cleanQuery);

		for (const folder of candidateFolders) {
			const candidateUrls = [
				`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions/${folder}/manifest.json?_t=${Date.now()}`,
				`https://res.cloudinary.com/${cleanCloud}/raw/upload/v1/chekiyuume/sessions/${folder}/manifest.json?_t=${Date.now()}`
			];

			for (const mUrl of candidateUrls) {
				try {
					const res = await fetch(mUrl, {
						cache: 'no-store',
						headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' }
					});
					if (res.ok) {
						const manifestData = await res.json();
						if (manifestData && (manifestData.sessionId || manifestData.photoUrl)) {
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
									photosCount:
										manifestData.photosCount ||
										(Array.isArray(manifestData.photos) ? manifestData.photos.length : undefined),
									printCount: manifestData.printCount || 0,
									createdAt: manifestData.createdAt || Date.now()
								}
							};
						}
					}
				} catch (_) {}
			}
		}

		return {
			success: false,
			error: `Sesi "${cleanQuery}" tidak ditemukan di Cloudflare D1 maupun folder Cloudinary ${cleanCloud}.`
		};
	} catch (err: any) {
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
		const res = await fetch(url, {
			cache: 'no-store',
			headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' }
		});
		if (!res.ok) {
			throw new Error(`Gagal mengunduh manifest dari URL (HTTP ${res.status})`);
		}
		const data = await res.json();
		if (!data || (!data.sessionId && !data.photoUrl)) {
			throw new Error('Format berkas JSON bukan manifest sesi ChekiYuume yang valid.');
		}
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
				photosCount:
					data.photosCount || (Array.isArray(data.photos) ? data.photos.length : undefined),
				printCount: data.printCount || 0,
				createdAt: data.createdAt || Date.now()
			}
		};
	} catch (err: any) {
		return {
			success: false,
			error: err?.message || String(err)
		};
	}
}

/**
 * Checks whether an asset or resource still exists on Cloudinary (returns false if 404/410/deleted)
 */
export async function checkCloudinaryResourceExists(url: string, timeoutMs: number = 6000): Promise<boolean> {
	if (!url || typeof url !== 'string' || !url.startsWith('http')) {
		return false;
	}

	const testUrl = url.includes('?') ? `${url}&_cb=${Date.now()}` : `${url}?_cb=${Date.now()}`;

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		const res = await fetch(testUrl, {
			method: 'GET',
			cache: 'no-store',
			signal: controller.signal,
			headers: {
				'Cache-Control': 'no-cache, no-store, must-revalidate',
				Pragma: 'no-cache'
			}
		});
		clearTimeout(timer);

		if (res.status === 404 || res.status === 410) {
			return false;
		}

		if (res.ok) {
			return true;
		}

		if (url.match(/\.(png|jpe?g|webp|gif)/i)) {
			return await testImageLoad(testUrl, timeoutMs);
		}

		return false;
	} catch {
		if (url.match(/\.(png|jpe?g|webp|gif)/i)) {
			return await testImageLoad(testUrl, timeoutMs);
		}
		return false;
	}
}

function testImageLoad(url: string, timeoutMs: number = 6000): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		if (typeof Image === 'undefined') {
			resolve(false);
			return;
		}
		const img = new Image();
		let done = false;
		const timer = setTimeout(() => {
			if (!done) {
				done = true;
				resolve(false);
			}
		}, timeoutMs);

		img.onload = () => {
			if (!done) {
				done = true;
				clearTimeout(timer);
				resolve(true);
			}
		};
		img.onerror = () => {
			if (!done) {
				done = true;
				clearTimeout(timer);
				resolve(false);
			}
		};
		img.src = url;
	});
}

/**
 * Checks if a session folder still exists in Cloudinary by checking its primary photostrip URL,
 * manifest URL, or candidate URLs.
 */
export async function checkSessionExistsInCloudinary(
	session: {
		sessionId: string;
		guestName?: string;
		cloudPhotoUrl?: string | null;
		photoUrl?: string;
		manifestUrl?: string;
		photostripDataUrl?: string | null;
	},
	cloudName: string
): Promise<boolean> {
	const cleanCloud = cloudName.trim();
	if (!cleanCloud) return false;

	const primaryPhotoUrl =
		session.cloudPhotoUrl && session.cloudPhotoUrl.startsWith('http') && session.cloudPhotoUrl.includes('cloudinary.com')
			? session.cloudPhotoUrl
			: session.photoUrl && session.photoUrl.startsWith('http') && session.photoUrl.includes('cloudinary.com')
			? session.photoUrl
			: session.photostripDataUrl && session.photostripDataUrl.startsWith('http') && session.photostripDataUrl.includes('cloudinary.com')
			? session.photostripDataUrl
			: null;

	if (primaryPhotoUrl) {
		const exists = await checkCloudinaryResourceExists(primaryPhotoUrl);
		if (exists) return true;
	}

	if (session.manifestUrl && session.manifestUrl.startsWith('http') && session.manifestUrl.includes('cloudinary.com')) {
		const exists = await checkCloudinaryResourceExists(session.manifestUrl);
		if (exists) return true;
	}

	const sanitizedGuest = sanitizeGuestName(session.guestName);
	const candidates = [
		`https://res.cloudinary.com/${cleanCloud}/image/upload/chekiyuume/sessions/${sanitizedGuest}_${session.sessionId}/photostrip_${session.sessionId}.png`,
		`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions/${sanitizedGuest}_${session.sessionId}/manifest.json`,
		`https://res.cloudinary.com/${cleanCloud}/image/upload/chekiyuume/sessions/${session.sessionId}/photostrip_${session.sessionId}.png`,
		`https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions/${session.sessionId}/manifest.json`
	];

	for (const url of candidates) {
		const exists = await checkCloudinaryResourceExists(url, 3000);
		if (exists) return true;
	}

	return false;
}

/**
 * Verifies all remote sessions in parallel batches of 8.
 * Returns filtered active sessions and IDs of sessions whose folders were deleted.
 */
export async function verifyActiveCloudinarySessions(
	sessions: CloudSessionSummary[],
	cloudName: string,
	onProgress?: (checked: number, total: number) => void
): Promise<{ activeSessions: CloudSessionSummary[]; deletedSessionIds: string[] }> {
	const activeSessions: CloudSessionSummary[] = [];
	const deletedSessionIds: string[] = [];
	const total = sessions.length;
	let checked = 0;

	const batchSize = 8;
	for (let i = 0; i < total; i += batchSize) {
		const chunk = sessions.slice(i, i + batchSize);
		const results = await Promise.all(
			chunk.map(async (cs) => {
				const exists = await checkSessionExistsInCloudinary(cs, cloudName);
				return { session: cs, exists };
			})
		);

		for (const res of results) {
			if (res.exists) {
				activeSessions.push(res.session);
			} else {
				deletedSessionIds.push(res.session.sessionId);
			}
		}

		checked += chunk.length;
		if (onProgress) {
			onProgress(Math.min(checked, total), total);
		}
	}

	return { activeSessions, deletedSessionIds };
}

/**
 * Deletes pruned/deleted session IDs from Cloudflare D1.
 */
export async function pruneDeletedSessionsFromCloudDB(
	deletedSessionIds: string[],
	adminPin?: string
): Promise<{ success: boolean; d1Unavailable?: boolean; deletedCount?: number }> {
	if (!deletedSessionIds || deletedSessionIds.length === 0) {
		return { success: true, deletedCount: 0 };
	}
	try {
		const pin = getAdminPinFromStorage(adminPin);
		const res = await fetch('/api/sessions', {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
				'x-admin-pin': pin
			},
			body: JSON.stringify({ sessionIds: deletedSessionIds })
		});

		if (res.status === 503 || res.status === 404) {
			return { success: false, d1Unavailable: true };
		}

		const data = await res.json().catch(() => ({}));
		return {
			success: Boolean(res.ok && data?.success),
			deletedCount: data?.deletedCount
		};
	} catch {
		return { success: false, d1Unavailable: true };
	}
}

/**
 * Updates D1 (and falls back to legacy Cloudinary manifest if D1 unavailable) after pruning deleted sessions.
 */
export async function updateGlobalSessionsManifestInCloudinary(
	activeSessions: CloudSessionSummary[],
	cloudName: string,
	uploadPreset: string,
	deletedSessionIds?: string[],
	adminPin?: string
): Promise<boolean> {
	try {
		if (deletedSessionIds && deletedSessionIds.length > 0) {
			const dbRes = await pruneDeletedSessionsFromCloudDB(deletedSessionIds, adminPin);
			if (dbRes.success) return true;
			if (!dbRes.d1Unavailable) return false;
		}

		const cleanCloud = cloudName.trim();
		const cleanPreset = uploadPreset.trim();
		if (!cleanCloud || !cleanPreset) return false;

		const blob = new Blob(
			[
				JSON.stringify(
					{
						version: '1.0',
						updatedAt: Date.now(),
						totalSessions: activeSessions.length,
						sessions: activeSessions
					},
					null,
					2
				)
			],
			{ type: 'application/json' }
		);

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
		return true;
	} catch (e) {
		console.warn('[CloudSync] Failed to prune/update sessions:', e);
		return false;
	}
}

export interface LegacyMigrationResult {
	success: boolean;
	importedSessions: number;
	totalLegacySessions: number;
	skippedSessions: number;
	importedFrames: number;
	totalLegacyFrames: number;
	skippedFrames: number;
	totalSessionsInD1?: number;
	totalFramesInD1?: number;
	error?: string;
}

/**
 * Triggers one-click idempotent migration from legacy Cloudinary manifests into Cloudflare D1.
 */
export async function migrateLegacyCloudinaryToD1(
	adminPin?: string
): Promise<LegacyMigrationResult> {
	try {
		const pin = getAdminPinFromStorage(adminPin);
		const res = await fetch('/api/migrate-legacy', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-admin-pin': pin
			}
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok || !data?.success) {
			return {
				success: false,
				importedSessions: 0,
				totalLegacySessions: 0,
				skippedSessions: 0,
				importedFrames: 0,
				totalLegacyFrames: 0,
				skippedFrames: 0,
				error: data?.error || `HTTP ${res.status}`
			};
		}
		return data as LegacyMigrationResult;
	} catch (err: any) {
		return {
			success: false,
			importedSessions: 0,
			totalLegacySessions: 0,
			skippedSessions: 0,
			importedFrames: 0,
			totalLegacyFrames: 0,
			skippedFrames: 0,
			error: err?.message || String(err)
		};
	}
}
