/** Екранування HTML для безпечної підстановки даних у шаблони. */
export function esc(v: unknown): string {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function $(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector(sel) as HTMLElement | null;
}
export function $$(sel: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll(sel)) as HTMLElement[];
}

let toastTimer: number | undefined;
export function toast(message: string, kind: 'ok' | 'error' | 'info' = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.className = `toast toast-${kind} show`;
  el.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 5000);
}

/** Модальне вікно на <dialog>: фокус-пастка і Esc працюють «з коробки». */
export function openDialog(html: string, onMount?: (dlg: HTMLDialogElement) => void): HTMLDialogElement {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.parentNode?.removeChild(dlg));
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.showModal();
  onMount?.(dlg);
  return dlg;
}

export function confirmDialog(opts: {
  title: string;
  text: string;
  confirm: string;
  cancel: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const dlg = openDialog(`
      <form method="dialog" class="dialog-body">
        <h2 class="dialog-title">${esc(opts.title)}</h2>
        <p>${esc(opts.text)}</p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" data-close>${esc(opts.cancel)}</button>
          <button type="submit" class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(opts.confirm)}</button>
        </div>
      </form>`);
    dlg.querySelector('[data-ok]')!.addEventListener('click', () => {
      result = true;
    });
    dlg.addEventListener('close', () => resolve(result));
  });
}
