import type { PrintOptions } from '$lib/types';

export function executePrint(imageDataUrl: string, options: PrintOptions): Promise<boolean> {
	return new Promise((resolve) => {
		const existing = document.getElementById('chekiyuume-print-iframe');
		if (existing) existing.remove();

		const iframe = document.createElement('iframe');
		iframe.id = 'chekiyuume-print-iframe';
		iframe.style.position = 'fixed';
		iframe.style.right = '0';
		iframe.style.bottom = '0';
		iframe.style.width = '0';
		iframe.style.height = '0';
		iframe.style.border = '0';
		iframe.style.visibility = 'hidden';

		document.body.appendChild(iframe);

		const doc = iframe.contentWindow?.document;
		if (!doc) {
			resolve(false);
			return;
		}

		const isA4 = options.paperSize === 'A4';
		const pageSizeCss = isA4
			? options.orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm'
			: options.orientation === 'landscape' ? '152.4mm 101.6mm' : '101.6mm 152.4mm';

		// Multi-copies generation
		const copiesCount = options.copies;
		let imagesHtml = '';

		if (isA4 && options.orientation === 'landscape' && options.sizeMode === 'actual' && options.a4SlotLane) {
			// A4 4-Lane slot positioning (paper saving)
			const laneTops = { 1: '20mm', 2: '83mm', 3: '146mm', 4: '209mm' };
			const topPos = laneTops[options.a4SlotLane] || '209mm';

			imagesHtml = `
				<div class="a4-lane-wrapper" style="top: ${topPos};">
					<img src="${imageDataUrl}" class="strip-img strip-2x6" />
					<div class="cut-guide"></div>
				</div>
			`;
		} else {
			// Standard grid / flex copies
			for (let i = 0; i < copiesCount; i++) {
				imagesHtml += `<img src="${imageDataUrl}" class="strip-img ${options.sizeMode === 'actual' ? 'strip-2x6' : 'strip-fit'}" />`;
			}
		}

		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<title>ChekiYuume Print</title>
				<style>
					@page {
						size: ${pageSizeCss};
						margin: 0;
					}
					* {
						box-sizing: border-box;
						margin: 0;
						padding: 0;
					}
					body, html {
						width: 100%;
						height: 100%;
						background: #fff;
						display: flex;
						justify-content: ${options.alignment === 'top-left' ? 'flex-start' : 'center'};
						align-items: ${options.alignment === 'top-left' ? 'flex-start' : 'center'};
						padding: ${options.alignment === 'top-left' ? '10mm' : '0'};
						overflow: hidden;
					}
					.print-container {
						display: flex;
						flex-direction: row;
						justify-content: center;
						align-items: center;
						gap: 3mm;
						width: 100%;
						height: 100%;
					}
					.strip-img {
						display: block;
						object-fit: contain;
						max-height: 100%;
					}
					.strip-2x6 {
						width: 50.8mm; /* 2 inches */
						height: 152.4mm; /* 6 inches */
					}
					.strip-fit {
						max-width: ${copiesCount === 2 ? '48%' : copiesCount === 4 ? '23%' : '96%'};
						max-height: 96%;
					}
					.a4-lane-wrapper {
						position: absolute;
						left: 20mm;
						width: 257mm;
						display: flex;
						align-items: center;
						gap: 10mm;
					}
					.cut-guide {
						position: absolute;
						bottom: -5mm;
						left: 0;
						width: 100%;
						border-bottom: 1px dashed #999;
					}
				</style>
			</head>
			<body>
				<div class="print-container">
					${imagesHtml}
				</div>
			</body>
			</html>
		`;

		doc.open();
		doc.write(html);
		doc.close();

		iframe.contentWindow?.addEventListener('afterprint', () => {
			setTimeout(() => iframe.remove(), 1000);
			resolve(true);
		});

		setTimeout(() => {
			iframe.contentWindow?.focus();
			iframe.contentWindow?.print();
			// Fallback resolution after timeout
			setTimeout(() => {
				if (document.getElementById('chekiyuume-print-iframe')) {
					resolve(true);
				}
			}, 3000);
		}, 600);
	});
}
