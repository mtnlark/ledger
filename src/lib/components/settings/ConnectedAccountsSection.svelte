<script lang="ts">
	import { onMount } from 'svelte';
	import type { LinkedAccount } from '$lib/db';
	import { toast } from '$lib/stores/toast';
	import {
		getAllLinkedAccounts,
		addLinkedAccount,
		updateLinkedAccount,
		deleteLinkedAccount,
		recordBalance,
		setSyncStatus
	} from '$lib/stores/linkedAccounts';
	import {
		isLinked as sfIsLinked,
		link as sfLink,
		unlink as sfUnlink,
		fetchAccounts as sfFetchAccounts,
		mapSimplefinAccount,
		type MappedSimplefinAccount
	} from '$lib/services/simplefin';

// --- SimpleFIN (Connected Accounts) ---
let sfLinked = $state(false);
let sfToken = $state('');
let sfBusy = $state(false);
let sfUpstream = $state<MappedSimplefinAccount[] | null>(null);
let sfAccounts = $state<LinkedAccount[]>([]);
let sfMapping = $state<Record<string, string>>({});
let sfConfirmingUnlink = $state(false);
let sfUnlinkMode = $state<'keep' | 'remove'>('keep');

let sfManualAccounts = $derived(sfAccounts.filter((a) => a.source === 'manual'));

async function sfRefreshLocal() {
	sfAccounts = await getAllLinkedAccounts();
}

async function sfInit() {
	try {
		sfLinked = await sfIsLinked();
		await sfRefreshLocal();
	} catch {
		// Non-Tauri environment (tests/web) — section stays in unlinked state
	}
}

async function sfConnect() {
	if (!sfToken.trim() || sfBusy) return;
	sfBusy = true;
	try {
		const resp = await sfLink(sfToken.trim());
		sfUpstream = resp.accounts.map(mapSimplefinAccount);
		sfLinked = true;
		sfToken = '';
		toast.success('SimpleFIN connected');
	} catch (error) {
		toast.error(String(error));
	} finally {
		sfBusy = false;
	}
}

async function sfLoadUpstream() {
	if (sfBusy) return;
	sfBusy = true;
	try {
		const resp = await sfFetchAccounts();
		sfUpstream = resp.accounts.map(mapSimplefinAccount);
	} catch (error) {
		toast.error(String(error));
	} finally {
		sfBusy = false;
	}
}

function sfConnectedTo(simplefinId: string): LinkedAccount | undefined {
	return sfAccounts.find((a) => a.simplefinId === simplefinId);
}

async function sfAddUpstream(mapped: MappedSimplefinAccount) {
	try {
		const choice = sfMapping[mapped.simplefinId] ?? 'new';
		if (choice === 'new') {
			// Negative upstream balance ⇒ almost certainly a credit card / debt
			const isLiability = mapped.balance < 0;
			await addLinkedAccount({
				name: mapped.name,
				institution: mapped.institution,
				accountClass: isLiability ? 'liability' : 'asset',
				accountType: isLiability ? 'credit' : 'other',
				initialBalance: Math.abs(mapped.balance),
				source: 'simplefin',
				simplefinId: mapped.simplefinId
			});
			const created = (await getAllLinkedAccounts()).find((a) => a.simplefinId === mapped.simplefinId);
			if (created) await setSyncStatus(created.id!, 'ok', new Date());
		} else {
			const id = Number(choice);
			const target = sfAccounts.find((a) => a.id === id);
			await updateLinkedAccount(id, { source: 'simplefin', simplefinId: mapped.simplefinId });
			const balance =
				target?.accountClass === 'liability' ? Math.abs(mapped.balance) : mapped.balance;
			await recordBalance(id, balance, 'simplefin');
			await setSyncStatus(id, 'ok', new Date());
		}
		await sfRefreshLocal();
		toast.success(`${mapped.name} connected`);
	} catch (error) {
		console.error('Failed to connect account:', error);
		toast.error('Failed to connect account');
	}
}

async function sfDisconnect(mode: 'keep' | 'remove') {
	if (sfBusy) return;
	sfBusy = true;
	try {
		await sfUnlink();
		const synced = sfAccounts.filter((a) => a.source === 'simplefin');
		if (mode === 'remove') {
			// Demo/test cleanup: drop the accounts and their snapshot history
			for (const account of synced) {
				await deleteLinkedAccount(account.id!);
			}
			toast.success('SimpleFIN disconnected — synced accounts removed');
		} else {
			// Safe default for real accounts: keep balances + history as manual
			for (const account of synced) {
				await updateLinkedAccount(account.id!, { source: 'manual' });
			}
			toast.success('SimpleFIN disconnected — accounts kept as manual');
		}
		sfLinked = false;
		sfUpstream = null;
		sfConfirmingUnlink = false;
		await sfRefreshLocal();
	} catch (error) {
		toast.error(String(error));
	} finally {
		sfBusy = false;
	}
}

	onMount(() => {
		sfInit();
	});
</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
	<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
		<h2 class="font-display text-xl font-medium text-charcoal">Connected Accounts</h2>
		<p class="text-sm text-charcoal-muted mt-1">Sync balances read-only from SimpleFIN Bridge for the Net Worth page</p>
	</div>
	<div class="p-6 space-y-5">
		{#if !sfLinked}
			<div>
				<label for="sf-token" class="block text-sm font-medium text-charcoal-soft mb-1.5">Setup token</label>
				<div class="flex gap-2">
					<input
						id="sf-token"
						type="password"
						bind:value={sfToken}
						placeholder="Paste your SimpleFIN setup token"
						class="flex-1 px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono text-sm"
					/>
					<button
						type="button"
						onclick={sfConnect}
						disabled={sfBusy || !sfToken.trim()}
						class="px-4 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
					>
						{sfBusy ? 'Connecting…' : 'Connect'}
					</button>
				</div>
				<p class="text-xs text-charcoal-muted mt-2">
					Get a setup token from SimpleFIN Bridge (bank login happens on their site, read-only).
					The access credential is stored in the macOS Keychain — it never touches your data file or backups.
				</p>
			</div>
		{:else}
			<div class="flex items-center justify-between">
				<p class="text-sm text-success-600 font-medium inline-flex items-center gap-1.5">
					<span class="w-2 h-2 rounded-full bg-success-500" aria-hidden="true"></span>
					SimpleFIN connected
				</p>
				<div class="flex gap-2">
					<button
						type="button"
						onclick={sfLoadUpstream}
						disabled={sfBusy}
						class="px-3 py-1.5 text-sm font-medium border border-theme text-charcoal-soft rounded-lg hover:bg-surface-alt transition-colors disabled:opacity-50"
					>
						{sfBusy ? 'Loading…' : 'Load accounts'}
					</button>
					<button
						type="button"
						onclick={() => { sfUnlinkMode = 'keep'; sfConfirmingUnlink = true; }}
						disabled={sfBusy}
						class="px-3 py-1.5 text-sm font-medium text-danger-600 hover:bg-danger-50 rounded-lg transition-colors disabled:opacity-50"
					>
						Unlink
					</button>
				</div>
			</div>
		{/if}

		{#if sfConfirmingUnlink}
			<div class="bg-warning-50 border border-warning-200 rounded-lg p-4 space-y-3">
				<p class="text-sm font-medium text-charcoal">Unlink SimpleFIN?</p>
				<label class="flex items-start gap-2 cursor-pointer">
					<input type="radio" bind:group={sfUnlinkMode} value="keep" class="mt-0.5" />
					<span class="text-sm text-charcoal-soft">Keep the synced accounts as manual<span class="block text-xs text-charcoal-muted">Balances and history stay on the Net Worth page; you update them yourself</span></span>
				</label>
				<label class="flex items-start gap-2 cursor-pointer">
					<input type="radio" bind:group={sfUnlinkMode} value="remove" class="mt-0.5" />
					<span class="text-sm text-charcoal-soft">Remove the synced accounts<span class="block text-xs text-charcoal-muted">Deletes them and their balance history — right choice for demo accounts</span></span>
				</label>
				<div class="flex justify-end gap-2 pt-1">
					<button
						type="button"
						onclick={() => (sfConfirmingUnlink = false)}
						class="px-3 py-1.5 text-sm font-medium border border-theme text-charcoal-soft rounded-lg hover:bg-surface-alt transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={() => sfDisconnect(sfUnlinkMode)}
						disabled={sfBusy}
						class="px-3 py-1.5 text-sm font-medium bg-danger-500 text-white rounded-lg hover:bg-danger-600 transition-colors disabled:opacity-50"
					>
						{sfBusy ? 'Unlinking…' : 'Unlink'}
					</button>
				</div>
			</div>
		{/if}

		{#if sfUpstream}
			<div class="space-y-2">
				<h3 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted">Available accounts</h3>
				{#each sfUpstream as up (up.simplefinId)}
					{@const existing = sfConnectedTo(up.simplefinId)}
					<div class="flex items-center gap-3 px-3 py-2.5 bg-surface-alt rounded-lg">
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-charcoal truncate">{up.name}</p>
							<p class="text-xs text-charcoal-muted">{up.institution} · <span class="font-mono">${up.balance.toLocaleString()}</span></p>
						</div>
						{#if existing}
							<span class="badge bg-success-100 text-success-600">Connected</span>
						{:else}
							<select
								bind:value={sfMapping[up.simplefinId]}
								class="px-2 py-1.5 text-sm bg-surface border border-theme rounded-lg"
								aria-label="Where to connect {up.name}"
							>
								<option value="new">Create new</option>
								{#each sfManualAccounts as manual (manual.id)}
									<option value={String(manual.id)}>Link to: {manual.name}</option>
								{/each}
							</select>
							<button
								type="button"
								onclick={() => sfAddUpstream(up)}
								class="px-3 py-1.5 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
							>
								Add
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
