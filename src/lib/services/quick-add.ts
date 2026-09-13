import type { TransactionFormData } from '$lib/components/TransactionForm.svelte';
import { PersistenceError } from '$lib/storage/status';
export interface QuickAddRequest { requestId: string; data: Omit<TransactionFormData, 'date'> & { date: string }; }
export interface QuickAddResult { requestId: string; status: 'saved' | 'unsaved' | 'rejected'; message?: string; }
/** Keeps in-flight requests too, so duplicate delivery cannot race an insert. */
export function createQuickAddHandler(add: (data: TransactionFormData) => Promise<unknown>, retry: () => Promise<void>) {
	const requests = new Map<string, { payload: string; result: Promise<QuickAddResult>; unsaved: boolean }>();
	return async (request: QuickAddRequest): Promise<QuickAddResult> => {
		if (!request || typeof request.requestId !== 'string' || !request.requestId || !request.data) return { requestId: request?.requestId, status: 'rejected', message: 'Invalid Quick Add request' };
		const payload = JSON.stringify(request.data);
		const existing = requests.get(request.requestId);
		if (existing && existing.payload !== payload) return { requestId: request.requestId, status: 'rejected', message: 'Request ID belongs to a different transaction' };
		if (existing && !existing.unsaved) return existing.result;
		const entry = { payload, result: Promise.resolve({ requestId: request.requestId, status: 'rejected' } as QuickAddResult), unsaved: false };
		requests.set(request.requestId, entry);
		entry.result = (async () => {
			try {
				if (existing?.unsaved) await retry();
				else await add({ ...request.data, date: new Date(request.data.date) });
				return { requestId: request.requestId, status: 'saved' } as QuickAddResult;
			} catch (error) {
				entry.unsaved = existing?.unsaved === true || (error instanceof PersistenceError && error.applied);
				return { requestId: request.requestId, status: entry.unsaved ? 'unsaved' : 'rejected', message: error instanceof Error ? error.message : String(error) } as QuickAddResult;
			}
		})();
		return entry.result;
	};
}

export interface QuickAddTransport {
	listen: (receive: (result: QuickAddResult) => void) => Promise<() => void>;
	emit: (request: QuickAddRequest) => Promise<void>;
}
/** Subscribe before sending; a missing acknowledgment must never count as success. */
export async function awaitQuickAddResult(request: QuickAddRequest, transport: QuickAddTransport, timeoutMs = 10000): Promise<QuickAddResult> {
	let receive!: (result: QuickAddResult) => void;
	const result = new Promise<QuickAddResult>((resolve) => { receive = resolve; });
	const unlisten = await transport.listen((value) => { if (value.requestId === request.requestId) receive(value); });
	const timer = setTimeout(() => receive({ requestId: request.requestId, status: 'unsaved', message: 'No acknowledgment yet. Submit again to check the same request.' }), timeoutMs);
	try { await transport.emit(request); return await result; }
	finally { clearTimeout(timer); unlisten(); }
}
