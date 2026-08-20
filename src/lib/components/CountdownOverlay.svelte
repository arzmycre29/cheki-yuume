<script lang="ts">
	interface Props {
		count: number | null;
		label?: string;
	}

	let { count, label = 'Siap-siap berpose!' }: Props = $props();
</script>

{#if count !== null && count > 0}
	<div class="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none">
		{#key count}
			<div class="text-center transform transition-transform animate-in zoom-in-75 fade-in duration-200">
				<div class="text-white font-black text-9xl tracking-tighter drop-shadow-[0_12px_24px_rgba(0,0,0,0.95)] font-display select-none">
					{count}
				</div>
				<div class="mt-4">
					<span class="text-sm font-extrabold uppercase tracking-widest text-rose-300 drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] bg-black/60 px-6 py-2 rounded-full border border-white/20 inline-block select-none">
						{label}
					</span>
				</div>
			</div>
		{/key}
	</div>
{:else if count === 0}
	<div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
		<div class="text-center scale-110 transform transition-all duration-200 animate-in zoom-in-90 duration-150">
			<div class="text-white font-black text-8xl tracking-tight drop-shadow-[0_12px_30px_rgba(0,0,0,0.95)] font-display bg-black/75 px-10 py-5 rounded-3xl border-2 border-white/30 text-rose-400 select-none">
				📸 SMILE!
			</div>
		</div>
	</div>
{/if}
