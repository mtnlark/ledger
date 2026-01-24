<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Chart, type ChartConfiguration } from 'chart.js/auto';
	import annotationPlugin from 'chartjs-plugin-annotation';

	Chart.register(annotationPlugin);

	interface Props {
		config: ChartConfiguration;
		class?: string;
	}

	let { config, class: className = '' }: Props = $props();

	let canvasRef = $state<HTMLCanvasElement | null>(null);
	let chartInstance: Chart | null = null;

	onMount(() => {
		if (canvasRef) {
			chartInstance = new Chart(canvasRef, config);
		}
	});

	onDestroy(() => {
		if (chartInstance) {
			chartInstance.destroy();
		}
	});

	// Update chart when config changes
	$effect(() => {
		if (chartInstance && config) {
			chartInstance.data = config.data;
			if (config.options) {
				chartInstance.options = config.options;
			}
			chartInstance.update();
		}
	});
</script>

<div class={className}>
	<canvas bind:this={canvasRef}></canvas>
</div>
