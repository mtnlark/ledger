import { describe, it, expect, vi } from 'vitest';
import { createBackdropHandler, createKeydownHandler } from './modal-helpers';

describe('modal-helpers', () => {
	describe('createBackdropHandler', () => {
		it('calls onClose when target equals currentTarget (backdrop clicked)', () => {
			const onClose = vi.fn();
			const handler = createBackdropHandler(onClose);

			// Simulate clicking directly on the backdrop
			const backdrop = document.createElement('div');
			const event = new MouseEvent('click', { bubbles: true });
			Object.defineProperty(event, 'target', { value: backdrop });
			Object.defineProperty(event, 'currentTarget', { value: backdrop });

			handler(event);

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('does not call onClose when target differs from currentTarget (child clicked)', () => {
			const onClose = vi.fn();
			const handler = createBackdropHandler(onClose);

			// Simulate clicking on a child element (event bubbled to backdrop)
			const backdrop = document.createElement('div');
			const modal = document.createElement('div');
			backdrop.appendChild(modal);

			const event = new MouseEvent('click', { bubbles: true });
			Object.defineProperty(event, 'target', { value: modal });
			Object.defineProperty(event, 'currentTarget', { value: backdrop });

			handler(event);

			expect(onClose).not.toHaveBeenCalled();
		});
	});

	describe('createKeydownHandler', () => {
		it('calls onClose when Escape key is pressed', () => {
			const onClose = vi.fn();
			const handler = createKeydownHandler(onClose);

			const event = new KeyboardEvent('keydown', { key: 'Escape' });
			handler(event);

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('does not call onClose for other keys', () => {
			const onClose = vi.fn();
			const handler = createKeydownHandler(onClose);

			const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
			const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
			const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });

			handler(enterEvent);
			handler(spaceEvent);
			handler(tabEvent);

			expect(onClose).not.toHaveBeenCalled();
		});

		it('handles Esc alias for Escape', () => {
			const onClose = vi.fn();
			const handler = createKeydownHandler(onClose);

			// Some older browsers might use 'Esc' instead of 'Escape'
			// But modern KeyboardEvent should use 'Escape'
			const event = new KeyboardEvent('keydown', { key: 'Escape' });
			handler(event);

			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});
});
