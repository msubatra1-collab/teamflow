import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; tone: ToastTone }
interface ToastContextValue { toast: (message: string, tone?: ToastTone) => void }
const ToastContext = createContext<ToastContextValue | null>(null);
let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = ++nextId;
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => dismiss(id), 3600);
  }, [dismiss]);
  const value = useMemo(() => ({ toast }), [toast]);
  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((item) => <div className={`toast toast-${item.tone}`} key={item.id}>
        <span className="toast-icon">{item.tone === 'success' ? <Check size={16} /> : <CircleAlert size={16} />}</span>
        <span>{item.message}</span>
        <button className="icon-button toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss"><X size={15} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context.toast;
}
