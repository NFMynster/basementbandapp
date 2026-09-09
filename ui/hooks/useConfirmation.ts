import { useEffect, useRef, useState } from "react";

export function useConfirmation() {
  const [confirmation, setConfirmation] = useState<{
    message: string;
    acceptLabel: string;
  } | null>(null);
  const confirmResolver = useRef<((accepted: boolean) => void) | null>(null);
  function confirmAction(message: string, acceptLabel = "Continue") {
    confirmResolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
      setConfirmation({ message, acceptLabel });
    });
  }
  function finishConfirmation(accepted: boolean) {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  }
  useEffect(
    () => () => {
      confirmResolver.current?.(false);
    },
    [],
  );
  return { confirmation, confirmAction, finishConfirmation };
}
