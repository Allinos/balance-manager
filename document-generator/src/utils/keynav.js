/**
 * Keyboard data entry for forms (no mouse needed).
 *
 * Any element marked `data-keynav` is a navigation area:
 *
 *   Enter        → next field (type → Enter → next field …)
 *   ↓ / ↑        → next / previous field
 *
 * Fields are text inputs, native selects, textareas and the searchable selects
 * (`.ss-control`), in document order — which is the visual order of our forms.
 * Disabled, read-only, hidden, checkbox/radio/file inputs, buttons and anything
 * inside an open dropdown are skipped.
 *
 * Normal editing is never taken away:
 *  - components that handle a key themselves (an open suggestion list, a
 *    searchable select, a dialog) call preventDefault and are left alone;
 *  - ↑/↓ are not used in native selects, date/time inputs or number spinners;
 *  - in a textarea Enter adds a new line; Enter on an empty last line (Enter
 *    twice) moves on, and ↑/↓ leave the textarea only from its first/last line.
 *
 * On the last field, Enter submits the surrounding <form>, or clicks the area's
 * `[data-keynav-submit]` button when there is one (e.g. the setup wizard's Continue).
 *
 * A button can be made a stop with `data-keynav-field` (e.g. "Add Item" after the
 * last item row): Enter presses it, ↑/↓ move on.
 */

const SKIP_TYPES = new Set(['hidden', 'checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'range', 'color', 'image']);
const NO_ARROW_TYPES = new Set(['date', 'datetime-local', 'time', 'month', 'week', 'number']);
const FIELD_SELECTOR = 'input, select, textarea, .ss-control, [data-keynav-field]';

function isField(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.matches('input') && SKIP_TYPES.has((el.getAttribute('type') || 'text').toLowerCase())) return false;
  if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return false;
  if (el.tabIndex < 0) return false;
  if (el.closest('.ss-pop, .autocomplete-list, [data-keynav-skip], [aria-hidden="true"], [inert]')) return false;
  // Visible (display/visibility) and actually laid out.
  if (!el.getClientRects().length) return false;
  if (getComputedStyle(el).visibility === 'hidden') return false;
  return true;
}

/** Navigable fields of an area, in order. */
export function fieldsOf(area) {
  return [...area.querySelectorAll(FIELD_SELECTOR)].filter(isField);
}

/** The navigation area an element belongs to. */
export const areaOf = (el) => el?.closest?.('[data-keynav]') || null;

/** The field that contains `el` (the element itself, or a searchable select's control). */
const fieldFor = (el) => (el.matches(FIELD_SELECTOR) ? el : el.closest('.ss')?.querySelector('.ss-control') || el);

/** Put focus on a field; numbers are selected so typing replaces them (quantities, rates …). */
export function focusField(el) {
  if (!el) return false;
  el.focus();
  if (el.matches('input') && (el.inputMode === 'decimal' || el.inputMode === 'numeric') && typeof el.select === 'function') el.select();
  el.scrollIntoView?.({ block: 'nearest' });
  return true;
}

/**
 * Move focus from `el` to the next (or previous) field of its area.
 * @returns {boolean} whether focus moved
 */
export function focusNext(el, step = 1) {
  const area = areaOf(el);
  if (!area) return false;
  const fields = fieldsOf(area);
  const current = fieldFor(el);
  let index = fields.indexOf(current);
  if (index < 0) {
    // Not in the list (e.g. focus inside a dropdown): find the position by document order.
    index = fields.findIndex((f) => current.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) - (step > 0 ? 1 : 0);
  }
  return focusField(fields[index + step]);
}

/** First field after `node` in its area (used to leave a repeating section such as item rows). */
export function focusFirstAfter(node) {
  const area = areaOf(node);
  if (!area) return false;
  return focusField(fieldsOf(area).find((f) => !node.contains(f) && node.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING));
}

function caretOnFirstLine(t) {
  return t.selectionStart === t.selectionEnd && t.value.lastIndexOf('\n', t.selectionStart - 1) === -1;
}
function caretOnLastLine(t) {
  return t.selectionStart === t.selectionEnd && t.value.indexOf('\n', t.selectionEnd) === -1;
}

/** Set a textarea's value the way React notices (for removing the extra new line). */
function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Enter on the last field: submit the form or press the area's submit button. */
function submitArea(el) {
  const area = areaOf(el);
  const button = area?.querySelector('[data-keynav-submit]');
  if (button && !button.disabled) {
    button.click();
    return true;
  }
  const form = el.form || el.closest('form');
  if (form && typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return true;
  }
  return false;
}

/** Next field, or — on the last field — submit (used after choosing from a dropdown with Enter). */
export function advance(el) {
  return focusNext(el, 1) || submitArea(el);
}

/** Document-level keydown handler (installed once, see hooks/useKeyboardNav.js). */
export function handleKeyNav(e) {
  if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
  const el = e.target;
  if (!(el instanceof HTMLElement) || !areaOf(el)) return;
  const field = fieldFor(el);
  if (!field.matches(FIELD_SELECTOR) || !isField(field)) return;
  const isButton = field.matches('button');
  if (isButton && e.key === 'Enter' && !field.classList.contains('ss-control')) return; // Enter presses the button
  const isTextarea = field.matches('textarea');
  const isSelect = field.matches('select');
  const type = (field.getAttribute('type') || 'text').toLowerCase();

  if (e.key === 'Enter' && !e.shiftKey) {
    if (isTextarea) {
      // New line as usual; Enter on an empty last line (or in an empty box) moves on.
      const atEnd = field.selectionStart === field.value.length && field.selectionEnd === field.value.length;
      if (field.value !== '' && !(atEnd && field.value.endsWith('\n'))) return;
      e.preventDefault();
      if (field.value.endsWith('\n')) setNativeValue(field, field.value.replace(/\n+$/, ''));
    } else {
      e.preventDefault();
    }
    if (!focusNext(field, 1)) submitArea(field);
    return;
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (e.shiftKey || isSelect || NO_ARROW_TYPES.has(type)) return;
    const down = e.key === 'ArrowDown';
    if (isTextarea && !(down ? caretOnLastLine(field) : caretOnFirstLine(field))) return;
    if (focusNext(field, down ? 1 : -1)) e.preventDefault();
  }
}
