import type { PrintOptions } from '$lib/types';

/**
 * Execute photostrip printing using an isolated invisible iframe.
 * Implements the Photostrip Print Engine specification with 4-slot A4 Eco matrix,
 * 90-degree CSS rotation for portrait paper feeds, and automatic garbage collection.
 *
 * @param imageDataUrl - Base64 Data URL or Blob URL of the photostrip/photo
 * @param options - Configured PrintOptions (paper size, orientation, copies, size mode, slot)
 * @param isPortraitStrip - Whether the image is a vertical photostrip (e.g. 2"x6" ratio < 0.45)
 * @returns Promise<boolean> Resolves to true when print is executed/closed
 */
export function executePrint(
	imageDataUrl: string,
	options: PrintOptions,
	isPortraitStrip: boolean = true
): Promise<boolean> {
	return new Promise((resolve) => {
		if (!imageDataUrl) {
			console.error('[PrintEngine] Error: imageDataUrl is required.');
			resolve(false);
			return;
		}

		// Remove any existing print iframe
		const existingIframe = document.getElementById('chekiyuume-print-iframe');
		if (existingIframe) {
			existingIframe.remove();
		}

		const iframe = document.createElement('iframe');
		iframe.id = 'chekiyuume-print-iframe';
		iframe.style.cssText =
			'position: absolute; width: 1px; height: 1px; top: -9999px; left: -9999px; border: none; overflow: hidden;';
		document.body.appendChild(iframe);

		const doc = iframe.contentWindow?.document || iframe.contentDocument;
		if (!doc) {
			console.error('[PrintEngine] Unable to access iframe document');
			if (document.body.contains(iframe)) document.body.removeChild(iframe);
			resolve(false);
			return;
		}

		const pageSizeRule =
			options.paperSize === '4R'
				? 'size: 101.6mm 152.4mm; margin: 0;'
				: 'size: A4; margin: 0;';

		const isHorizontalLayout =
			options.paperSize === 'A4' &&
			options.sizeMode === 'actual' &&
			options.orientation === 'landscape';

		let bodyStyles = '';
		let imageTagsHtml = '';

		const copies = options.sizeMode === 'fit' ? 1 : options.copies;

		if (isHorizontalLayout) {
			// A4 Landscape Eco Mode (4-Slot matrix with 90° rotation)
			const tops = ['20mm', '83mm', '146mm', '209mm'];
			const slotIndex = options.selectedSlot ?? (options.a4SlotLane ? options.a4SlotLane - 1 : 0);
			const topOffset = tops[slotIndex] || '20mm';

			bodyStyles = `
				html, body {
					margin: 0;
					padding: 0;
					width: 100%;
					height: 100%;
					position: relative;
					background: #ffffff;
					box-sizing: border-box;
				}
				.rotated-print-container {
					position: absolute;
					top: ${topOffset};
					left: 10mm;
					display: flex;
					flex-direction: column;
					gap: 5mm;
					border-top: 0.5mm dashed #888888;
					border-bottom: 0.5mm dashed #888888;
					padding-top: 5.5mm;
					padding-bottom: 5.5mm;
				}
				.rotated-wrapper {
					position: relative;
					width: 152.4mm;   /* 6 inch */
					height: 50.8mm;   /* 2 inch */
					overflow: hidden;
				}
				.rotated-wrapper img {
					position: absolute;
					top: 50%;
					left: 50%;
					width: 50.8mm;    /* 2 inch */
					height: 152.4mm;  /* 6 inch */
					transform: translate(-50%, -50%) rotate(90deg);
					object-fit: contain;
				}
			`;

			for (let i = 0; i < copies; i++) {
				imageTagsHtml += `<div class="rotated-wrapper"><img src="${imageDataUrl}" alt="Photostrip" /></div>`;
			}
			imageTagsHtml = `<div class="rotated-print-container">${imageTagsHtml}</div>`;
		} else {
			// Standard Portrait / 4R layout
			let bodyAlignStyles = 'justify-content: center; align-items: center;';
			if (options.paperSize === 'A4' && options.sizeMode === 'actual' && options.alignment === 'top-left') {
				bodyAlignStyles = 'justify-content: flex-start; align-items: flex-start;';
			}

			let imgSizingStyles = '';
			if (options.sizeMode === 'fit') {
				imgSizingStyles = 'width: auto; height: auto; max-width: 100%; max-height: 100%; object-fit: contain;';
			} else {
				const targetWidth = isPortraitStrip ? '50.8mm' : '101.6mm';
				imgSizingStyles = `width: ${targetWidth}; height: auto; max-height: 90%; object-fit: contain;`;
			}

			bodyStyles = `
				html, body {
					margin: 0;
					padding: 0;
					width: 100%;
					height: 100%;
					display: flex;
					flex-direction: row;
					box-sizing: border-box;
					background: #ffffff;
					gap: 15px;
					${bodyAlignStyles}
					padding: 10mm;
				}
				.print-img {
					display: block;
					box-shadow: none;
					border: none;
					${imgSizingStyles}
				}
			`;

			for (let i = 0; i < copies; i++) {
				imageTagsHtml += `<img src="${imageDataUrl}" class="print-img" alt="Photostrip" />`;
			}
		}

		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<title>ChekiYuume Print Output</title>
				<style>
					@page { ${pageSizeRule} }
					${bodyStyles}
				</style>
			</head>
			<body>
				${imageTagsHtml}
				<script>
					window.onload = () => {
						window.focus();
						setTimeout(() => {
							window.print();
						}, 300);
					};
					window.onafterprint = () => {
						window.parent.postMessage('chekiyuume-print-done', '*');
					};
				</script>
			</body>
			</html>
		`;

		const handleMessage = (event: MessageEvent) => {
			if (event.data === 'chekiyuume-print-done') {
				window.removeEventListener('message', handleMessage);
				if (document.body.contains(iframe)) {
					document.body.removeChild(iframe);
				}
				resolve(true);
			}
		};

		window.addEventListener('message', handleMessage);
		doc.open();
		doc.write(html);
		doc.close();

		// Safety fallback: Clean up iframe after 60s if print dialog is cancelled or abandoned
		setTimeout(() => {
			if (document.body.contains(iframe)) {
				window.removeEventListener('message', handleMessage);
				document.body.removeChild(iframe);
				resolve(true);
			}
		}, 60000);
	});
}
