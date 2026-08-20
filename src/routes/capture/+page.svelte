<script lang="ts">
	import { goto } from '$app/navigation';
	import { sessionStore } from '$lib/stores/session';
	import { getLayoutById } from '$lib/config/frameLayouts';
	import DefaultCaptureFlow from '$lib/components/modes/DefaultCaptureFlow.svelte';
	import CreativeCaptureFlow from '$lib/components/modes/CreativeCaptureFlow.svelte';
	import CreativeArranger from '$lib/components/modes/CreativeArranger.svelte';
	import { onMount } from 'svelte';

	let session = $derived($sessionStore);
	let currentLayout = $derived(getLayoutById(session.layoutId));

	let creativeStep = $state<'capturing' | 'arranging'>('capturing');

	onMount(() => {
		const currentSession = sessionStore.hydrate();
		if (!currentSession.sessionId) {
			goto('/');
		}
	});

	function handleFinishDefault() {
		goto('/processing');
	}

	function handleFinish8Shots() {
		creativeStep = 'arranging';
	}

	function handleFinishArrangement() {
		goto('/processing');
	}
</script>

<div class="h-full w-full flex flex-col justify-center items-center overflow-hidden">
	{#if session.mode === 'default'}
		<DefaultCaptureFlow
			layout={currentLayout}
			onFinishCapture={handleFinishDefault}
		/>
	{:else}
		{#if creativeStep === 'capturing'}
			<CreativeCaptureFlow
				layout={currentLayout}
				onFinish8Shots={handleFinish8Shots}
			/>
		{:else}
			<CreativeArranger
				onFinishArrangement={handleFinishArrangement}
			/>
		{/if}
	{/if}
</div>
