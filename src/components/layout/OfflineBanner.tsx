import React, { memo } from 'react';
import { WifiOff } from 'lucide-react';

interface OfflineBannerProps {
  isOnline: boolean;
}

/**
 * Banner fijo que se muestra cuando no hay conexión a internet.
 * Informa al usuario que los cambios se guardarán localmente.
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = memo(({ isOnline }) => {
  if (isOnline) return null;

  return (
    <div className="bg-amber-500 dark:bg-amber-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 z-50 shrink-0">
      <WifiOff size={16} className="animate-pulse" />
      <span>Sin conexión — Los cambios se guardarán localmente y se sincronizarán al reconectar</span>
    </div>
  );
});

OfflineBanner.displayName = 'OfflineBanner';
