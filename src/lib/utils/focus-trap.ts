/**
 * Focus trap utility for modal dialogs
 *
 * Traps keyboard focus within a container element, cycling through
 * focusable elements when Tab is pressed. Returns focus to the
 * triggering element when the trap is released.
 */

// Selector for all focusable elements
const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
	'[contenteditable="true"]'
].join(', ');

interface FocusTrapState {
	container: HTMLElement;
	previouslyFocused: HTMLElement | null;
	handleKeydown: (e: KeyboardEvent) => void;
}

let activeTrap: FocusTrapState | null = null;

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
	const elements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
	return Array.from(elements).filter((el) => {
		// Filter out hidden elements
		return el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
	});
}

/**
 * Create a focus trap within the specified container
 *
 * @param container - The element to trap focus within
 * @param options - Configuration options
 * @returns A cleanup function to release the trap
 */
export function createFocusTrap(
	container: HTMLElement,
	options: {
		initialFocus?: HTMLElement | null;
		returnFocusOnDeactivate?: boolean;
	} = {}
): () => void {
	const { initialFocus = null, returnFocusOnDeactivate = true } = options;

	// Store currently focused element to restore later
	const previouslyFocused = document.activeElement as HTMLElement | null;

	// Handle Tab key to trap focus
	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;

		const focusable = getFocusableElements(container);
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (e.shiftKey) {
			// Shift+Tab: if on first element, wrap to last
			if (document.activeElement === first || !container.contains(document.activeElement)) {
				e.preventDefault();
				last.focus();
			}
		} else {
			// Tab: if on last element, wrap to first
			if (document.activeElement === last || !container.contains(document.activeElement)) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	// Release any existing trap
	if (activeTrap) {
		releaseFocusTrap();
	}

	// Set up the trap
	activeTrap = {
		container,
		previouslyFocused,
		handleKeydown
	};

	document.addEventListener('keydown', handleKeydown);

	// Focus initial element or first focusable
	queueMicrotask(() => {
		if (initialFocus) {
			initialFocus.focus();
		} else {
			const focusable = getFocusableElements(container);
			if (focusable.length > 0) {
				focusable[0].focus();
			}
		}
	});

	// Return cleanup function
	return () => {
		releaseFocusTrap(returnFocusOnDeactivate);
	};
}

/**
 * Release the active focus trap
 *
 * @param returnFocus - Whether to return focus to the previously focused element
 */
export function releaseFocusTrap(returnFocus = true): void {
	if (!activeTrap) return;

	document.removeEventListener('keydown', activeTrap.handleKeydown);

	if (returnFocus && activeTrap.previouslyFocused) {
		// Use queueMicrotask to ensure DOM updates are complete
		queueMicrotask(() => {
			activeTrap?.previouslyFocused?.focus();
		});
	}

	activeTrap = null;
}

/**
 * Svelte action for focus trapping
 *
 * Usage:
 * ```svelte
 * <div use:focusTrap>
 *   <!-- modal content -->
 * </div>
 * ```
 */
export function focusTrap(node: HTMLElement, enabled = true) {
	let cleanup: (() => void) | null = null;

	function activate() {
		if (!cleanup) {
			cleanup = createFocusTrap(node);
		}
	}

	function deactivate() {
		if (cleanup) {
			cleanup();
			cleanup = null;
		}
	}

	if (enabled) {
		activate();
	}

	return {
		update(newEnabled: boolean) {
			if (newEnabled && !cleanup) {
				activate();
			} else if (!newEnabled && cleanup) {
				deactivate();
			}
		},
		destroy() {
			deactivate();
		}
	};
}
