/**
 * In-DOM native <select> overlay for all frames (live screencast visibility).
 * Uses capture-phase pointerdown + composedPath for open shadow roots.
 */

export {};

const ROOT_ID = '__hs_select_picker_root';
const CHANNEL = '__hs_select_picker_v1';
const frameSourceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type OptGroup = { label: string; options: HTMLOptionElement[] };

function collectOptGroups(select: HTMLSelectElement): OptGroup[] {
  const groups: OptGroup[] = [];
  let loose: HTMLOptionElement[] = [];

  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptionElement) {
      loose.push(child);
    } else if (child instanceof HTMLOptGroupElement) {
      if (loose.length) {
        groups.push({ label: '', options: loose });
        loose = [];
      }
      groups.push({
        label: child.label || '',
        options: Array.from(child.children).filter(
          (n): n is HTMLOptionElement => n instanceof HTMLOptionElement
        ),
      });
    }
  }
  if (loose.length) {
    groups.push({ label: '', options: loose });
  }
  return groups.filter((g) => g.options.length > 0);
}

function findSelectFromEvent(ev: Event): HTMLSelectElement | null {
  const path = ev.composedPath();
  for (const node of path) {
    if (node instanceof HTMLSelectElement) return node;
  }
  return null;
}

function shouldIntercept(select: HTMLSelectElement): boolean {
  if (select.disabled) return false;
  if (select.size > 1) return false;
  if (!select.options.length) return false;
  return true;
}

let overlayRoot: HTMLDivElement | null = null;
let activeSelect: HTMLSelectElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let outsidePointerHandler: ((e: PointerEvent) => void) | null = null;
let outsidePointerGeneration = 0;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;

function broadcastCloseOthers() {
  channel?.postMessage({ type: 'open', sourceId: frameSourceId });
}

function onChannelMessage(ev: MessageEvent) {
  if (ev.data?.type === 'open' && ev.data?.sourceId !== frameSourceId) {
    destroyOverlay();
  }
}

if (channel) {
  channel.addEventListener('message', onChannelMessage);
}

function destroyOverlay() {
  outsidePointerGeneration += 1;
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
  }
  if (outsidePointerHandler) {
    document.removeEventListener('pointerdown', outsidePointerHandler, true);
    outsidePointerHandler = null;
  }
  overlayRoot?.remove();
  overlayRoot = null;
  activeSelect = null;
}

function positionPanel(panel: HTMLDivElement, select: HTMLSelectElement) {
  const rect = select.getBoundingClientRect();
  const margin = 4;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  panel.style.maxHeight = `${Math.min(320, vh * 0.5)}px`;
  panel.style.width = `${Math.min(Math.max(rect.width, 160), vw - margin * 2)}px`;
  panel.style.left = `${Math.max(margin, Math.min(rect.left, vw - parseInt(panel.style.width, 10) - margin))}px`;

  let top = rect.bottom + margin;
  const ph = panel.offsetHeight || 200;
  if (top + ph > vh - margin) {
    top = Math.max(margin, rect.top - ph - margin);
  }
  panel.style.top = `${top}px`;
}

function injectStyles(root: HTMLDivElement) {
  const style = document.createElement('style');
  style.textContent = `
    #${ROOT_ID} { all: initial; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    #${ROOT_ID} .__hs_backdrop {
      position: fixed; inset: 0; z-index: 2147483645; background: rgba(0,0,0,0.12);
    }
    #${ROOT_ID} .__hs_panel {
      position: fixed; z-index: 2147483646; background: #fff; color: #111;
      border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      overflow: hidden; display: flex; flex-direction: column;
      border: 1px solid rgba(0,0,0,0.12);
    }
    #${ROOT_ID} .__hs_list { overflow-y: auto; max-height: inherit; }
    #${ROOT_ID} .__hs_group_label {
      padding: 6px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.04em; color: #666; background: #f4f4f4; border-bottom: 1px solid #e0e0e0;
    }
    #${ROOT_ID} .__hs_row {
      padding: 10px 12px; font-size: 14px; cursor: pointer; border: none; width: 100%; text-align: left;
      background: #fff; color: inherit; display: flex; align-items: center; gap: 8px;
    }
    #${ROOT_ID} .__hs_row:hover { background: #f0f7ff; }
    #${ROOT_ID} .__hs_row[disabled] { opacity: 0.45; cursor: not-allowed; }
    #${ROOT_ID} .__hs_footer {
      padding: 8px 12px; border-top: 1px solid #e0e0e0; display: flex; justify-content: flex-end; gap: 8px;
      background: #fafafa;
    }
    #${ROOT_ID} .__hs_btn {
      padding: 6px 14px; border-radius: 6px; font-size: 13px; cursor: pointer;
      border: 1px solid #ccc; background: #fff;
    }
    #${ROOT_ID} .__hs_btn_primary { background: #1a73e8; color: #fff; border-color: #1a73e8; }
    #${ROOT_ID} .__hs_empty { padding: 16px; color: #666; font-size: 13px; }
  `;
  root.appendChild(style);
}

function openOverlay(select: HTMLSelectElement) {
  destroyOverlay();
  broadcastCloseOthers();

  activeSelect = select;
  const root = document.createElement('div');
  root.id = ROOT_ID;
  injectStyles(root);

  const backdrop = document.createElement('div');
  backdrop.className = '__hs_backdrop';
  root.appendChild(backdrop);

  const panel = document.createElement('div');
  panel.className = '__hs_panel';
  root.appendChild(panel);

  const list = document.createElement('div');
  list.className = '__hs_list';
  panel.appendChild(list);

  const groups = collectOptGroups(select);
  const isMultiple = select.multiple;

  const selected = new Set(
    isMultiple
      ? Array.from(select.selectedOptions).map((o) => o.value)
      : select.value
        ? [select.value]
        : []
  );

  const renderRows = () => {
    list.replaceChildren();
    if (!groups.some((g) => g.options.length)) {
      const empty = document.createElement('div');
      empty.className = '__hs_empty';
      empty.textContent = 'No options';
      list.appendChild(empty);
      return;
    }
    for (const g of groups) {
      if (g.label) {
        const gl = document.createElement('div');
        gl.className = '__hs_group_label';
        gl.textContent = g.label;
        list.appendChild(gl);
      }
      for (const opt of g.options) {
        if (isMultiple) {
          const row = document.createElement('label');
          row.className = '__hs_row';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = selected.has(opt.value);
          cb.disabled = opt.disabled;
          cb.addEventListener('change', () => {
            if (cb.checked) selected.add(opt.value);
            else selected.delete(opt.value);
          });
          const span = document.createElement('span');
          span.textContent = opt.text || opt.value || '(empty)';
          row.appendChild(cb);
          row.appendChild(span);
          list.appendChild(row);
        } else {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = '__hs_row';
          btn.disabled = opt.disabled;
          btn.textContent = opt.text || opt.value || '(empty)';
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (opt.disabled) return;
            select.value = opt.value;
            select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            destroyOverlay();
          });
          list.appendChild(btn);
        }
      }
    }
  };

  renderRows();

  if (isMultiple) {
    const footer = document.createElement('div');
    footer.className = '__hs_footer';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = '__hs_btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => destroyOverlay());
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = '__hs_btn __hs_btn_primary';
    apply.textContent = 'Apply';
    apply.addEventListener('click', () => {
      for (const opt of Array.from(select.options)) {
        opt.selected = selected.has(opt.value);
      }
      select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      destroyOverlay();
    });
    footer.appendChild(cancel);
    footer.appendChild(apply);
    panel.appendChild(footer);
  }

  document.documentElement.appendChild(root);
  overlayRoot = root;

  requestAnimationFrame(() => positionPanel(panel, select));

  keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      destroyOverlay();
    }
  };
  document.addEventListener('keydown', keyHandler, true);

  backdrop.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    destroyOverlay();
  });

  const gen = outsidePointerGeneration;
  queueMicrotask(() => {
    if (gen !== outsidePointerGeneration || !overlayRoot) return;
    outsidePointerHandler = (e: PointerEvent) => {
      if (!overlayRoot) return;
      const t = e.target as Node;
      if (!overlayRoot.contains(t)) {
        destroyOverlay();
      }
    };
    document.addEventListener('pointerdown', outsidePointerHandler, true);
  });
}

function onPointerDownCapture(ev: PointerEvent) {
  if (ev.button !== 0) return;
  const select = findSelectFromEvent(ev);
  if (!select || !shouldIntercept(select)) return;

  if (overlayRoot && activeSelect === select) return;

  ev.preventDefault();
  ev.stopPropagation();
  openOverlay(select);
}

document.addEventListener('pointerdown', onPointerDownCapture, true);
