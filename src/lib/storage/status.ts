import { writable } from 'svelte/store';

export class PersistenceError extends Error {
	constructor(message: string, public readonly applied: boolean, public readonly cause?: unknown) {
		super(message);
		this.name = 'PersistenceError';
	}
}
export const saveStatus = writable<'saved' | 'saving' | 'unsaved'>('saved');
let unresolved = false;
saveStatus.subscribe((status) => { if (status === 'unsaved') unresolved = true; else if (status === 'saved') unresolved = false; });
export function assertCanMutate(): void {
	if (unresolved) {
		throw new PersistenceError('Changes not saved to disk. Retry saving before making more changes.', false);
	}
}
