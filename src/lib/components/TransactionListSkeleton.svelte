<script lang="ts">
	import Skeleton from './Skeleton.svelte';

	interface Props {
		count?: number;
	}

	let { count = 3 }: Props = $props();
</script>

<div class="space-y-4">
	<!-- Date header skeleton -->
	<div>
		<Skeleton class="h-3 mb-2 ml-1" width="80px" rounded="sm" />
		<div class="bg-surface rounded-xl shadow-sm shadow-theme overflow-hidden divide-y divide-dashed divide-theme-dashed">
			{#each Array(count) as _, i (i)}
				<div class="px-4 py-3 flex items-center gap-3">
					<!-- Icon skeleton -->
					<Skeleton class="w-9 h-9" rounded="lg" />

					<!-- Content skeleton -->
					<div class="flex-1 space-y-2">
						<Skeleton class="h-4" width="60%" rounded="sm" />
						<Skeleton class="h-3" width="40%" rounded="sm" />
					</div>

					<!-- Amount skeleton -->
					<div class="text-right space-y-1">
						<Skeleton class="h-5 ml-auto" width="60px" rounded="sm" />
						<Skeleton class="h-3 ml-auto" width="40px" rounded="sm" />
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
