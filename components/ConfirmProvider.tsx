'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import ConfirmModal from './ConfirmModal';

type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string;
};

const ConfirmCtx = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);

// useConfirm() returns an async confirm(opts) → Promise<boolean>, a drop-in
// replacement for window.confirm that renders the themed modal.
export function useConfirm() {
  return useContext(ConfirmCtx);
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })), []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <ConfirmModal
        open={!!state}
        title={state?.opts.title ?? ''}
        message={state?.opts.message ?? ''}
        confirmLabel={state?.opts.confirmLabel}
        danger={state?.opts.danger}
        requireText={state?.opts.requireText}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmCtx.Provider>
  );
}
