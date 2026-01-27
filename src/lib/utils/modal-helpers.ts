/**
 * Modal utility functions for consistent modal behavior
 */

/**
 * Creates a backdrop click handler that closes the modal when clicking outside the content.
 * Only triggers when the click target is the backdrop itself (not bubbled from children).
 *
 * @param onClose - Function to call when backdrop is clicked
 * @returns Event handler for backdrop clicks
 */
export function createBackdropHandler(onClose: () => void) {
	return (e: MouseEvent) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};
}

/**
 * Creates a keyboard handler that closes the modal on Escape key press.
 *
 * @param onClose - Function to call when Escape is pressed
 * @returns Event handler for keydown events
 */
export function createKeydownHandler(onClose: () => void) {
	return (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			onClose();
		}
	};
}
