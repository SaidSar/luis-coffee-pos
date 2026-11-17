import { useEffect, useRef } from 'react';

// Excluye inputs ocultos (type="hidden") y deshabilitados
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Descarta elementos que no pueden recibir foco (display:none, p. ej. <input className="hidden">)
const isVisible = (el: HTMLElement) =>
  typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null;

// Accesibilidad de diálogos modales (WCAG 2.1.2, 2.4.3):
// mueve el foco al diálogo, lo mantiene dentro (Tab / Shift+Tab),
// cierra con Escape y devuelve el foco al elemento que lo abrió.
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const previous = document.activeElement as HTMLElement | null;
    node.focus();

    // Listener en document: Escape y el trap siguen funcionando aunque el foco se haya escapado del diálogo.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!node.contains(active)) {
        // foco fuera del diálogo: devolverlo adentro
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (active === node) {
        // foco en el contenedor: Shift+Tab salta al último; Tab sigue natural al primero
        if (e.shiftKey) {
          e.preventDefault();
          last.focus();
        }
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, []);

  return ref;
}
