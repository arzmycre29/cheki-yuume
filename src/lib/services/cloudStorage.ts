import QRCode from 'qrcode';
import type { SessionData, KioskSettings, FrameLayout } from '$lib/types';

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
}

/**
 * Uploads a single file to Cloudinary via Unsigned Upload Preset with explicit folder & filename
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

	formData.append('upload_preset', uploadPreset);

	// Dedicated Cloudinary Folder handling (both classic folder & dynamic asset_folder)
	if (options.folder) {
		const cleanFolder = options.folder.replace(/^\/+|\/+$/g, '');
		formData.append('folder', cleanFolder);
		formData.append('asset_folder', cleanFolder);
	}

	if (options.publicId) {
		let cleanPublicId = options.publicId;
		if (options.folder && cleanPublicId.startsWith(options.folder)) {
			cleanPublicId = cleanPublicId.slice(options.folder.length).replace(/^\/+/, '');
		}
		formData.append('public_id', cleanPublicId);
	}

	if (fileName) {
		const nameOnly = fileName.replace(/\.[^/.]+$/, '');
		formData.append('filename_override', nameOnly);
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

	const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
	const res = await fetch(endpoint, {
		method: 'POST',
		body: formData
	});

	if (!res.ok) {
		const errJson = await res.json().catch(() => ({}));
		throw new Error(`Cloudinary upload failed: ${errJson.error?.message || res.statusText}`);
	}

	const data = await res.json();
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

			// Automatically append session into central Cloudinary sessions_manifest.json
			recordSessionToCloudinaryManifest(
				{
					sessionId: session.sessionId,
					guestName: session.guestName,
					mode: session.mode,
					layoutId: session.layoutId,
					photoUrl: photoUrl || undefined,
					videoUrl: videoUrl || undefined,
					shareUrl,
					createdAt: session.createdAt || Date.now()
				},
				cloudName,
				uploadPreset
			).catch((e) => console.warn('[Cloudinary] Session manifest background sync warning:', e));

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
		if (customOnly.length === 0) {
			return {
				success: false,
				count: 0,
				error: 'Belum ada custom frame untuk dicadangkan.'
			};
		}

		const manifestData = {
			version: '1.0',
			updatedAt: Date.now(),
			totalCustomFrames: customOnly.length,
			frames: customOnly
		};

		const blob = new Blob([JSON.stringify(manifestData, null, 2)], {
			type: 'application/json'
		});

		const manifestUrl = await uploadToCloudinary(blob, 'raw', cloudName, uploadPreset, {
			folder: 'chekiyuume',
			publicId: 'frames_manifest.json',
			fileName: 'frames_manifest.json',
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

		const manifestUrl = `https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/frames_manifest.json?_t=${Date.now()}`;
		const res = await fetch(manifestUrl);

		if (!res.ok) {
			if (res.status === 404) {
				throw new Error(
					'Belum ada manifest frame di Cloudinary (chekiyuume/frames_manifest.json). Lakukan "Backup ke Cloud" terlebih dahulu.'
				);
			}
			throw new Error(`Gagal mengunduh manifest frame dari Cloudinary (HTTP ${res.status})`);
		}

		const data = await res.json();
		if (!data || !Array.isArray(data.frames)) {
			throw new Error('Format manifest frame di Cloudinary tidak valid.');
		}

		return {
			success: true,
			frames: data.frames,
			count: data.frames.length
		};
	} catch (err: any) {
		console.warn('[Frames] Retrieve from Cloudinary failed:', err);
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
		if (!cleanCloud || !cleanPreset) return;

		let existingSessions: CloudSessionSummary[] = [];
		try {
			const manifestUrl = `https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions_manifest.json?_t=${Date.now()}`;
			const res = await fetch(manifestUrl);
			if (res.ok) {
				const data = await res.json();
				if (data && Array.isArray(data.sessions)) {
					existingSessions = data.sessions;
				}
			}
		} catch (_) {}

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

		await uploadToCloudinary(blob, 'raw', cleanCloud, cleanPreset, {
			folder: 'chekiyuume',
			publicId: 'sessions_manifest.json',
			fileName: 'sessions_manifest.json',
			tags: ['chekiyuume', 'sessions_manifest', 'database']
		});
		console.log('[Cloudinary] Global session manifest updated successfully');
	} catch (err) {
		console.warn('[Cloudinary] Failed to update sessions manifest:', err);
	}
}

/**
 * Retrieves all sessions from Cloudinary sessions_manifest.json
 */
export async function retrieveSessionsFromCloudinary(
	cloudName: string
): Promise<{ success: boolean; sessions: CloudSessionSummary[]; count: number; error?: string }> {
	try {
		const cleanCloud = cloudName.trim();
		if (!cleanCloud) {
			throw new Error('Cloud Name Cloudinary belum diatur.');
		}

		const manifestUrl = `https://res.cloudinary.com/${cleanCloud}/raw/upload/chekiyuume/sessions_manifest.json?_t=${Date.now()}`;
		const res = await fetch(manifestUrl);

		if (!res.ok) {
			if (res.status === 404) {
				return {
					success: true,
					sessions: [],
					count: 0
				};
			}
			throw new Error(`Gagal mengunduh manifest sesi dari Cloudinary (HTTP ${res.status})`);
		}

		const data = await res.json();
		if (!data || !Array.isArray(data.sessions)) {
			throw new Error('Format manifest sesi di Cloudinary tidak valid.');
		}

		return {
			success: true,
			sessions: data.sessions,
			count: data.sessions.length
		};
	} catch (err: any) {
		console.warn('[Sessions] Retrieve sessions from Cloudinary failed:', err);
		return {
			success: false,
			sessions: [],
			count: 0,
			error: err?.message || String(err)
		};
	}
}
