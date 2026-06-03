<script lang="ts">
	import { format } from 'date-fns';
	import { Plus, Trash2 } from 'lucide-svelte';
	import type { Category, Settings, Transaction } from '$lib/db';
	import { parseLocalDate } from '$lib/utils/date-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { sumCurrency } from '$lib/utils/currency';
	import ModalContainer from './ModalContainer.svelte';
	import SharedExpenseFields from './SharedExpenseFields.svelte';

	interface SplitLine {
		categoryId: number;
		amount: number;
		notes: string;
	}

	/** Shape passed back to the parent — notes is optional (omitted when blank). */
	interface SplitLineOut {
		categoryId: number;
		amount: number;
		notes?: string;
	}

	interface SharedFields {
		merchant: string;
		date: Date;
		isShared: boolean;
		splitType: 'percentage' | 'fixed';
		splitValue: number;
		isSettled: boolean;
	}

	interface Props {
		isOpen: boolean;
		parentId: number | null;
		/** The split's existing children — used to seed the editor. */
		children: Transaction[];
		categories: Category[];
		settings: Settings;
		onSave: (parentId: number, shared: SharedFields, lines: SplitLineOut[]) => void | Promise<unknown>;
		onClose: () => void;
	}

	let { isOpen, parentId, children, categories, settings, onSave, onClose }: Props = $props();

	let isSubmitting = $state(false);

	// Group-level fields
	let merchant = $state('');
	let dateStr = $state('');
	let isShared = $state(false);
	let splitType = $state<'percentage' | 'fixed'>('percentage');
	let splitValue = $state(0.5);
	let isSettled = $state(false);

	// Per-category lines
	let lines = $state<SplitLine[]>([]);

	let activeCategories = $derived(categories.filter((c) => c.isActive));

	// Seed the form from the existing children whenever the modal opens.
	$effect(() => {
		if (isOpen && children.length > 0) {
			const first = children[0];
			merchant = first.merchant;
			dateStr = format(new Date(first.date), 'yyyy-MM-dd');
			isShared = first.isShared;
			splitType = first.splitType;
			splitValue = first.splitValue;
			isSettled = first.isSettled;
			lines = children.map((c) => ({
				categoryId: c.categoryId,
				amount: c.amount,
				notes: c.notes ?? ''
			}));
			isSubmitting = false;
		}
	});

	// The new total is simply the sum of the lines — editing a split lets you
	// change the overall amount (unlike creating one from a fixed charge).
	let total = $derived(sumCurrency(lines.map((l) => l.amount || 0)));

	let isValid = $derived(
		merchant.trim().length > 0 &&
			lines.length >= 2 &&
			lines.every((l) => l.categoryId > 0 && l.amount > 0)
	);

	function addLine() {
		lines = [...lines, { categoryId: 0, amount: 0, notes: '' }];
	}

	function removeLine(index: number) {
		if (lines.length > 1) {
			lines = lines.filter((_, i) => i !== index);
		}
	}

	function updateLine(index: number, field: 'categoryId' | 'amount', value: number) {
		lines = lines.map((line, i) => (i === index ? { ...line, [field]: value } : line));
	}

	function updateLineNotes(index: number, value: string) {
		lines = lines.map((line, i) => (i === index ? { ...line, notes: value } : line));
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!isValid || parentId === null || isSubmitting) return;

		isSubmitting = true;
		try {
			await onSave(
				parentId,
				{
					merchant: merchant.trim(),
					date: parseLocalDate(dateStr),
					isShared,
					splitType,
					splitValue,
					isSettled
				},
				lines.map((l) => ({
					categoryId: l.categoryId,
					amount: l.amount,
					notes: l.notes.trim() || undefined
				}))
			);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<ModalContainer isOpen={isOpen && parentId !== null} title="Edit Split" maxWidth="lg" onClose={onClose}>
	<form onsubmit={handleSubmit}>
		<!-- Body -->
		<div class="p-6 space-y-4">
			<!-- Date & Merchant Row -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="edit-split-date" class="block text-sm font-medium text-charcoal-soft mb-1.5">Date</label>
					<input
						type="date"
						id="edit-split-date"
						bind:value={dateStr}
						class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
					/>
				</div>
				<div>
					<label for="edit-split-merchant" class="block text-sm font-medium text-charcoal-soft mb-1.5">Merchant</label>
					<input
						type="text"
						id="edit-split-merchant"
						bind:value={merchant}
						placeholder="e.g., Walmart, Costco"
						class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
					/>
				</div>
			</div>

			<!-- Split Lines -->
			<div class="space-y-3">
				<div class="text-sm font-medium text-charcoal-soft">Split into categories</div>

				{#each lines as line, index (index)}
					<div class="bg-surface-alt border border-theme rounded-lg p-3 space-y-2">
						<div class="flex items-center gap-2">
							<!-- Category Select -->
							<select
								value={line.categoryId}
								onchange={(e) => updateLine(index, 'categoryId', parseInt(e.currentTarget.value))}
								class="flex-1 min-w-0 px-3 py-2 bg-surface border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
							>
								<option value={0}>Select category...</option>
								{#each activeCategories as cat (cat.id)}
									<option value={cat.id}>{cat.icon} {cat.name}</option>
								{/each}
							</select>

							<!-- Amount Input -->
							<div class="relative w-28 flex-shrink-0">
								<span class="absolute left-2 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono text-sm">$</span>
								<input
									type="number"
									value={line.amount}
									oninput={(e) => updateLine(index, 'amount', parseFloat(e.currentTarget.value) || 0)}
									step="0.01"
									min="0"
									class="w-full pl-6 pr-2 py-2 bg-surface border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono text-sm"
								/>
							</div>

							<!-- Remove Button -->
							<button
								type="button"
								onclick={() => removeLine(index)}
								disabled={lines.length <= 2}
								class="p-2 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
								aria-label="Remove line"
							>
								<Trash2 size={16} />
							</button>
						</div>

						<!-- Notes (optional, preserves tags) -->
						<input
							type="text"
							value={line.notes}
							oninput={(e) => updateLineNotes(index, e.currentTarget.value)}
							placeholder="Notes / #tags (optional)"
							class="w-full px-3 py-1.5 bg-surface border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors text-sm placeholder:text-charcoal-muted"
						/>
					</div>
				{/each}

				<!-- Add Line Button -->
				<button
					type="button"
					onclick={addLine}
					class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 border border-dashed border-primary-300 rounded-lg transition-colors"
				>
					<Plus size={16} />
					<span>Add Line</span>
				</button>

				<!-- Live total -->
				<div class="flex justify-between items-center px-1 text-sm">
					<span class="text-charcoal-soft">Total</span>
					<span class="font-mono font-medium text-charcoal">{formatCurrency(total)}</span>
				</div>
			</div>

			<!-- Shared expense fields (applied to all lines) -->
			<SharedExpenseFields
				bind:isShared
				bind:splitType
				bind:splitValue
				bind:isSettled
				amount={total}
				partnerName={settings.partnerName}
				showSettledOption={true}
				idPrefix="edit-split-"
			/>
		</div>

		<!-- Footer -->
		<div class="flex gap-3 px-6 py-4 border-t border-dashed border-theme-dashed bg-surface-alt rounded-b-xl">
			<button
				type="button"
				onclick={onClose}
				class="px-4 py-2.5 border border-theme text-charcoal-soft rounded-lg font-medium hover:bg-surface-hover transition-colors"
			>
				Cancel
			</button>
			<button
				type="submit"
				disabled={!isValid || isSubmitting}
				class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-150 flex items-center justify-center gap-2"
			>
				{#if isSubmitting}
					<div class="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
				{/if}
				Save Changes
			</button>
		</div>
	</form>
</ModalContainer>
