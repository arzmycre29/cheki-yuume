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
 * Saves or shares a file across Web Browsers (Web Share API / Anchor download)
 * and dynamically delegates to native Android Capacitor plugins if available at runtime.
 */
export async function saveOrShareFile(
	content: Blob | string,
	fileName: string,
	mimeType: string,
	dialogTitle = 'Simpan Media'
): Promise<boolean> {
	// 1. Dynamic check for native Capacitor runtime bridge (if loaded inside Android container)
	const cap = typeof window !== 'undefined' ? (window as any).Capacitor : null;
	if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
		try {
			const filesystem = cap.Plugins?.Filesystem;
			const share = cap.Plugins?.Share;

			if (filesystem && share) {
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

				const writeResult = await filesystem.writeFile({
					path: fileName,
					data: base64Data,
					directory: 'CACHE',
					recursive: true
				});

				const fileUri = writeResult.uri;

				await share.share({
					title: fileName,
					text: `ChekiYuume Photobooth - ${fileName}`,
					files: [fileUri],
					dialogTitle
				});
				return true;
			}
		} catch (nativeErr) {
			console.warn('[FileSaver] Native Capacitor save/share failed, trying web fallback:', nativeErr);
		}
	}

	// 2. Web Share API (native sheet on Chrome Android / iOS Safari / modern browsers)
	if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
		try {
			let file: File | null = null;
			if (typeof content === 'string') {
				if (content.startsWith('data:') || content.startsWith('blob:')) {
					const res = await fetch(content);
					const blob = await res.blob();
					file = new File([blob], fileName, { type: mimeType });
				}
			} else {
				file = new File([content], fileName, { type: mimeType });
			}

			if (file && navigator.canShare({ files: [file] })) {
				await navigator.share({
					files: [file],
					title: fileName,
					text: `ChekiYuume - ${fileName}`
				});
				return true;
			}
		} catch (shareErr: any) {
			// User canceled share sheet or permission denied
			if (shareErr?.name === 'AbortError') {
				return true;
			}
			console.warn('[FileSaver] Web Share API failed, falling back to download anchor:', shareErr);
		}
	}

	// 3. Web Browser anchor download fallback
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
