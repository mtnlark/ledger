/**
 * Registry for page-specific keyboard shortcut handlers.
 *
 * KeyboardShortcuts mounts once in the root layout so navigation shortcuts
 * (⌘1–5, ⌘/) work app-wide; pages register handlers for the shortcuts that
 * need page context (⌘N quick add, ⌘K search focus). Handlers are looked up
 * at keypress time, so no reactivity is required.
 */
export interface ShortcutHandlers {
	openQuickAdd?: () => void;
	focusSearch?: () => void;
}

let handlers: ShortcutHandlers = {};

/** Register the current page's handlers. Returns an unregister function for effect cleanup. */
export function registerShortcutHandlers(h: ShortcutHandlers): () => void {
	handlers = h;
	return () => {
		if (handlers === h) handlers = {};
	};
}

export function getShortcutHandlers(): ShortcutHandlers {
	return handlers;
}
