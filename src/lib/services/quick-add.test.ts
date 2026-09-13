import { afterEach, expect, it, vi } from 'vitest';
import { awaitQuickAddResult, type QuickAddRequest } from './quick-add';
const request = { requestId: 'one', data: {} } as QuickAddRequest;
afterEach(() => vi.useRealTimers());
it('registers the response listener before sending and releases it after success', async () => {
	const calls: string[] = []; const unlisten = vi.fn();
	let receive!: (value: { requestId: string; status: 'saved' }) => void;
	const result = await awaitQuickAddResult(request, {
		listen: async (callback) => { calls.push('listen'); receive = callback; return unlisten; },
		emit: async () => { calls.push('emit'); receive({ requestId: 'one', status: 'saved' }); }
	});
	expect(calls).toEqual(['listen', 'emit']); expect(result.status).toBe('saved'); expect(unlisten).toHaveBeenCalledOnce();
});
it('times out without success, ignores unrelated acknowledgments and leaves the request reusable', async () => {
	vi.useFakeTimers(); const unlisten = vi.fn();
	const result = awaitQuickAddResult(request, { listen: async (receive) => { receive({ requestId: 'other', status: 'saved' }); return unlisten; }, emit: vi.fn().mockResolvedValue(undefined) }, 100);
	await vi.advanceTimersByTimeAsync(101);
	expect(await result).toMatchObject({ requestId: 'one', status: 'unsaved' });
	expect(request.requestId).toBe('one'); expect(unlisten).toHaveBeenCalledOnce();
});
it('cleans up after an emission failure', async () => {
	const unlisten = vi.fn();
	await expect(awaitQuickAddResult(request, { listen: async () => unlisten, emit: async () => { throw new Error('unavailable'); } })).rejects.toThrow('unavailable');
	expect(unlisten).toHaveBeenCalledOnce();
});
