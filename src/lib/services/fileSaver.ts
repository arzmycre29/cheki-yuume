import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

async function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result as string;
			const base64 = result.split(',')[1] || result;
			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

function dataUrlToBase64(dataUrl: string): string {
	const parts = dataUrl.split(',');
	return parts[1] || parts[0];
}

/**
 * Saves or shares a file across native Android (via Capacitor Filesystem & Share Sheet)
 * and Web Browsers (via standard anchor download).
 */
export async function saveOrShareFile(
	content: Blob | string,
	fileName: string,
	mimeType: string,
	dialogTitle = 'Simpan Media'
): Promise<boolean> {
	if (Capacitor.isNativePlatform()) {
		try {
			let base64Data = '';
			if (typeof content === 'string') {
				if (content.startsWith('data:')) {
					base64Data = dataUrlToBase64(content);
				} else if (content.startsWith('blob:') || content.startsWith('http')) {
					const res = await fetch(content);
					const b = await res.blob();
					base64Data = await blobToBase64(b);
				} else {
					base64Data = content;
				}
			} else {
				base64Data = await blobToBase64(content);
			}

			// Write to cache directory so system share provider can access it
			const writeResult = await Filesystem.writeFile({
				path: fileName,
				data: base64Data,
				directory: Directory.Cache,
				recursive: true
			});

			const fileUri = writeResult.uri;

			// Open native Android Share/Save sheet
			await Share.share({
				title: fileName,
				text: `ChekiYuume Photobooth - ${fileName}`,
				files: [fileUri],
				dialogTitle
			});
			return true;
		} catch (nativeErr) {
			console.warn('[FileSaver] Native save/share failed, trying fallback:', nativeErr);
		}
	}

	// Web Browser fallback
	try {
		let downloadUrl = '';
		let shouldRevoke = false;

		if (typeof content === 'string') {
			downloadUrl = content;
		} else {
			downloadUrl = URL.createObjectURL(content);
			shouldRevoke = true;
		}

		const a = document.createElement('a');
		a.href = downloadUrl;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		if (shouldRevoke) {
			setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
		}
		return true;
	} catch (e) {
		console.error('[FileSaver] Web download failed:', e);
		return false;
	}
}
