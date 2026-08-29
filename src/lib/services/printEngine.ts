import type { PrintOptions, LayoutCategory } from '$lib/types';

/**
 * Execute photostrip printing using an isolated invisible iframe.
 * Implements the Adaptive Photostrip Print Engine supporting:
 * - 4-Slot A4 Landscape Eco matrix (Strip: 4-Cut / 3-Cut)
 * - 2×2 A4 Duo Grid matrix (Duo: 2-Cut)
 * - 2×2 A4 Card Grid matrix (Card: 1-Cut / Polaroid)
 * - 4R Multi-card & multi-strip positioning
 * - Cross & dashed cutting guidelines
 * - Automatic garbage collection & safe async lifecycle
 *
 * @param imageDataUrl - Base64 Data URL or Blob URL of the photostrip/photo
 * @param options - Configured PrintOptions (paper size, orientation, copies, size mode, slot, category)
 * @param isPortraitStrip - Whether the image is a vertical photostrip
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

		const category: LayoutCategory =
			options.layoutCategory || (isPortraitStrip ? 'strip' : 'card');

		const copies = options.sizeMode === 'fit' ? 1 : options.copies;
		const slotIndex = options.selectedSlot ?? (options.a4SlotLane ? options.a4SlotLane - 1 : 0);

		let bodyStyles = '';
		let contentHtml = '';

		// ─── A4 PAPER LAYOUT COMPILERS ───
		if (options.paperSize === 'A4' && options.sizeMode === 'actual') {
			if (category === 'strip' && options.orientation === 'landscape') {
				// 1. A4 Landscape Eco Mode (4-Slot Horizontal with 90° rotation)
				const tops = ['20mm', '83mm', '146mm', '209mm'];
				const topOffset = tops[slotIndex] || '20mm';

				bodyStyles = `
					html, body {
						margin: 0; padding: 0; width: 100%; height: 100%;
						position: relative; background: #ffffff; box-sizing: border-box;
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
						width: 152.4mm;
						height: 50.8mm;
						overflow: hidden;
					}
					.rotated-wrapper img {
						position: absolute;
						top: 50%;
						left: 50%;
						width: 50.8mm;
						height: 152.4mm;
						transform: translate(-50%, -50%) rotate(90deg);
						object-fit: contain;
					}
				`;

				let stripsHtml = '';
				for (let i = 0; i < copies; i++) {
					stripsHtml += `<div class="rotated-wrapper"><img src="${imageDataUrl}" alt="Photostrip" /></div>`;
				}
				contentHtml = `<div class="rotated-print-container">${stripsHtml}</div>`;
			} else if (category === 'duo') {
				// 2. A4 2×2 Duo Grid Matrix (4 Quadrants)
				const duoCoords = [
					{ top: '15mm', left: '22mm' },  // Slot 0: Top-Left
					{ top: '15mm', left: '120mm' }, // Slot 1: Top-Right
					{ top: '160mm', left: '22mm' }, // Slot 2: Bottom-Left
					{ top: '160mm', left: '120mm' } // Slot 3: Bottom-Right
				];

				bodyStyles = `
					html, body {
						margin: 0; padding: 0; width: 100%; height: 100%;
						position: relative; background: #ffffff; box-sizing: border-box;
					}
					.cross-cut-h {
						position: absolute; top: 148.5mm; left: 10mm; width: 190mm;
						border-top: 0.5mm dashed #888888;
					}
					.cross-cut-v {
						position: absolute; left: 105mm; top: 10mm; height: 277mm;
						border-left: 0.5mm dashed #888888;
					}
					.duo-grid-item {
						position: absolute;
						width: 68mm;
						height: 119mm;
						display: flex;
						align-items: center;
						justify-content: center;
					}
					.duo-grid-item img {
						width: 100%;
						height: 100%;
						object-fit: contain;
					}
				`;

				let duoItemsHtml = '';
				for (let i = 0; i < copies; i++) {
					const targetSlot = (slotIndex + i) % 4;
					const pos = duoCoords[targetSlot];
					duoItemsHtml += `
						<div class="duo-grid-item" style="top: ${pos.top}; left: ${pos.left};">
							<img src="${imageDataUrl}" alt="Duo Strip ${i + 1}" />
						</div>
					`;
				}

				contentHtml = `
					<div class="cross-cut-h"></div>
					<div class="cross-cut-v"></div>
					${duoItemsHtml}
				`;
			} else if (category === 'card') {
				// 3. A4 2×2 Card Grid Matrix (4 Polaroid Quadrants)
				const cardCoords = [
					{ top: '28mm', left: '12mm' },  // Slot 0: Top-Left
					{ top: '28mm', left: '110mm' }, // Slot 1: Top-Right
					{ top: '175mm', left: '12mm' }, // Slot 2: Bottom-Left
					{ top: '175mm', left: '110mm' } // Slot 3: Bottom-Right
				];

				bodyStyles = `
					html, body {
						margin: 0; padding: 0; width: 100%; height: 100%;
						position: relative; background: #ffffff; box-sizing: border-box;
					}
					.cross-cut-h {
						position: absolute; top: 148.5mm; left: 10mm; width: 190mm;
						border-top: 0.5mm dashed #888888;
					}
					.cross-cut-v {
						position: absolute; left: 105mm; top: 10mm; height: 277mm;
						border-left: 0.5mm dashed #888888;
					}
					.card-grid-item {
						position: absolute;
						width: 88mm;
						height: 90mm;
						display: flex;
						align-items: center;
						justify-content: center;
					}
					.card-grid-item img {
						width: 100%;
						height: 100%;
						object-fit: contain;
					}
				`;

				let cardItemsHtml = '';
				for (let i = 0; i < copies; i++) {
					const targetSlot = (slotIndex + i) % 4;
					const pos = cardCoords[targetSlot];
					cardItemsHtml += `
						<div class="card-grid-item" style="top: ${pos.top}; left: ${pos.left};">
							<img src="${imageDataUrl}" alt="Card ${i + 1}" />
						</div>
					`;
				}

				contentHtml = `
					<div class="cross-cut-h"></div>
					<div class="cross-cut-v"></div>
					${cardItemsHtml}
				`;
			} else {
				// 4. A4 Portrait Strip (Side-by-side flex)
				let bodyAlignStyles = 'justify-content: center; align-items: center;';
				if (options.alignment === 'top-left') {
					bodyAlignStyles = 'justify-content: flex-start; align-items: flex-start;';
				}

				bodyStyles = `
					html, body {
						margin: 0; padding: 0; width: 100%; height: 100%;
						display: flex; flex-direction: row; box-sizing: border-box;
						background: #ffffff; gap: 10mm;
						${bodyAlignStyles}
						padding: 10mm;
					}
					.print-img {
						display: block; box-shadow: none; border: none;
						width: 50.8mm; height: auto; max-height: 90%; object-fit: contain;
					}
				`;

				let imgTags = '';
				for (let i = 0; i < copies; i++) {
					imgTags += `<img src="${imageDataUrl}" class="print-img" alt="Photostrip" />`;
				}
				contentHtml = imgTags;
			}
		} else if (options.paperSize === '4R' && options.sizeMode === 'actual') {
			// ─── 4R PAPER LAYOUT COMPILERS ───
			if (category === 'card') {
				if (copies === 2) {
					// 2 Cards stacked Top & Bottom on 4R (101.6mm × 152.4mm)
					bodyStyles = `
						html, body {
							margin: 0; padding: 0; width: 100%; height: 100%;
							display: flex; flex-direction: column; align-items: center; justify-content: space-around;
							position: relative; background: #ffffff; box-sizing: border-box; padding: 6mm 0;
						}
						.card-4r-item {
							width: 72mm; height: 74mm; display: flex; align-items: center; justify-content: center;
						}
						.card-4r-item img {
							width: 100%; height: 100%; object-fit: contain;
						}
						.cut-guide-4r {
							position: absolute; top: 76.2mm; left: 5mm; width: 91.6mm;
							border-top: 0.5mm dashed #888888;
						}
					`;
					contentHtml = `
						<div class="card-4r-item"><img src="${imageDataUrl}" alt="Card 1" /></div>
						<div class="cut-guide-4r"></div>
						<div class="card-4r-item"><img src="${imageDataUrl}" alt="Card 2" /></div>
					`;
				} else {
					// 1 Card centered on 4R
					bodyStyles = `
						html, body {
							margin: 0; padding: 0; width: 100%; height: 100%;
							display: flex; align-items: center; justify-content: center;
							background: #ffffff; box-sizing: border-box; padding: 5mm;
						}
						.card-4r-single {
							width: 90mm; height: 92mm;
						}
						.card-4r-single img {
							width: 100%; height: 100%; object-fit: contain;
						}
					`;
					contentHtml = `<div class="card-4r-single"><img src="${imageDataUrl}" alt="Card Single" /></div>`;
				}
			} else {
				// Strip & Duo on 4R (1 or 2 strips side-by-side)
				bodyStyles = `
					html, body {
						margin: 0; padding: 0; width: 100%; height: 100%;
						display: flex; flex-direction: row; align-items: center; justify-content: center;
						background: #ffffff; box-sizing: border-box; gap: 2mm; padding: 2mm;
					}
					.print-4r-strip {
						display: block; box-shadow: none; border: none;
						width: ${copies === 2 ? '49mm' : '70mm'}; height: auto; max-height: 96%; object-fit: contain;
					}
				`;

				let imgTags = '';
				for (let i = 0; i < copies; i++) {
					imgTags += `<img src="${imageDataUrl}" class="print-4r-strip" alt="Photostrip" />`;
				}
				contentHtml = imgTags;
			}
		} else {
			// ─── FIT TO PAGE / FALLBACK LAYOUT ───
			bodyStyles = `
				html, body {
					margin: 0; padding: 0; width: 100%; height: 100%;
					display: flex; align-items: center; justify-content: center;
					background: #ffffff; box-sizing: border-box; padding: 5mm;
				}
				.fit-img {
					width: auto; height: auto; max-width: 98%; max-height: 98%; object-fit: contain;
				}
			`;
			contentHtml = `<img src="${imageDataUrl}" class="fit-img" alt="Photo Fit" />`;
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
				${contentHtml}
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

