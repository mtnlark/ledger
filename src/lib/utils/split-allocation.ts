/** Allocate the purchase-level share in cents. Ties preserve category line order. */
export function allocatePartnerShares(amounts: number[], isShared: boolean, type: 'fixed' | 'percentage', value: number): number[] {
	if (amounts.length < 2 || amounts.some((n) => !Number.isFinite(n) || n <= 0)) throw new Error('Invalid category amounts');
	const cents = amounts.map((n) => Math.round(n * 100));
	const total = cents.reduce((a, b) => a + b, 0);
	if (!Number.isSafeInteger(total) || cents.some((n) => n <= 0)) throw new Error('Invalid purchase amount');
	if (!Number.isFinite(value) || value < 0 || !['fixed', 'percentage'].includes(type) || (isShared && (type === 'percentage' ? value > 1 : Math.round(value * 100) > total))) throw new Error('Partner share must be within the purchase total');
	const target = isShared ? Math.round(type === 'fixed' ? value * 100 : total * value) : 0;
	const allocations = cents.map((n) => Number(BigInt(n) * BigInt(target) / BigInt(total)));
	const order = cents.map((n, i) => ({ i, remainder: (BigInt(n) * BigInt(target)) % BigInt(total) }))
		.sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
	let remaining = target - allocations.reduce((a, b) => a + b, 0);
	for (const { i } of order) { if (remaining-- <= 0) break; allocations[i]++; }
	return allocations.map((n) => n / 100);
}
