<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Chart, type ChartConfiguration } from 'chart.js/auto';
	import annotationPlugin from 'chartjs-plugin-annotation';
	import { TreemapController, TreemapElement } from 'chartjs-chart-treemap';

	Chart.register(annotationPlugin, TreemapController, TreemapElement);

	interface Props {
		config: ChartConfiguration;
		class?: string;
	}

	let { config, class: className = '' }: Props = $props();

	let canvasRef = $state<HTMLCanvasElement | null>(null);
	let chartInstance: Chart | null = null;
	let currentType: string | undefined = undefined;

	function createChart() {
		if (canvasRef && config) {
			chartInstance = new Chart(canvasRef, config);
			currentType = config.type;
		}
	}

	function destroyChart() {
		if (chartInstance) {
			chartInstance.destroy();
			chartInstance = null;
		}
	}

	onMount(() => {
		createChart();
	});

	onDestroy(() => {
		destroyChart();
	});

	// Update chart when config changes
	// Recreate if chart type changes, otherwise just update data/options
	$effect(() => {
		if (!config) return;

		if (chartInstance) {
			// If chart type changed, destroy and recreate
			if (config.type !== currentType) {
				destroyChart();
				createChart();
			} else {
				// Same type - just update data and options
				chartInstance.data = config.data;
				if (config.options) {
					chartInstance.options = config.options;
				}
				chartInstance.update();
			}
		}
	});
</script>

<div class={className}>
	<canvas bind:this={canvasRef}></canvas>
</div>
