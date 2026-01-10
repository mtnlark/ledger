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
		<Skeleton class="h-4 mb-2 ml-1" width="100px" rounded="sm" />
		<div class="space-y-2">
			{#each Array(count) as _, i}
				<div class="bg-surface rounded-lg shadow-sm border border-gray-100 p-4 flex items-center gap-4">
					<!-- Icon skeleton -->
					<Skeleton class="w-10 h-10" rounded="lg" />

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
