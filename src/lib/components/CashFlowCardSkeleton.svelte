<script lang="ts">
	import Skeleton from './Skeleton.svelte';
</script>

<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
	<!-- Header -->
	<div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
		<Skeleton class="h-6" width="120px" rounded="sm" />
		<Skeleton class="h-4" width="80px" rounded="sm" />
	</div>

	<!-- Content -->
	<div class="p-6 space-y-4">
		<!-- Income row -->
		<div class="flex justify-between items-center">
			<Skeleton class="h-4" width="60px" rounded="sm" />
			<Skeleton class="h-5" width="100px" rounded="sm" />
		</div>

		<!-- Saved row -->
		<div class="flex justify-between items-center">
			<Skeleton class="h-4" width="50px" rounded="sm" />
			<Skeleton class="h-4" width="80px" rounded="sm" />
		</div>

		<!-- Divider -->
		<div class="border-t border-gray-200"></div>

		<!-- Available row -->
		<div class="flex justify-between items-center">
			<Skeleton class="h-4" width="70px" rounded="sm" />
			<Skeleton class="h-5" width="100px" rounded="sm" />
		</div>

		<!-- Spent row -->
		<div class="flex justify-between items-center">
			<Skeleton class="h-4" width="40px" rounded="sm" />
			<Skeleton class="h-4" width="80px" rounded="sm" />
		</div>

		<!-- Divider -->
		<div class="border-t border-gray-200"></div>

		<!-- Surplus row -->
		<div class="flex justify-between items-center">
			<Skeleton class="h-4" width="55px" rounded="sm" />
			<Skeleton class="h-6" width="90px" rounded="sm" />
		</div>

		<!-- Progress bar -->
		<div class="mt-4">
			<div class="flex justify-between mb-1">
				<Skeleton class="h-3" width="100px" rounded="sm" />
				<Skeleton class="h-3" width="50px" rounded="sm" />
			</div>
			<Skeleton class="h-2 w-full" rounded="full" />
		</div>
	</div>
</div>
