import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../components/layout/ErrorBoundary';
import { captureError } from '../../lib/errorReporter';

vi.mock('../../lib/errorReporter', () => ({ captureError: vi.fn() }));

const internalMessage = 'Firebase API key AIza-secret no está configurada';

function BrokenChild(): never {
  throw new Error(internalMessage);
}

describe('ErrorBoundary en producción', () => {
  beforeEach(() => {
    vi.mocked(captureError).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('ofrece recuperación sin exponer diagnóstico interno', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<ErrorBoundary><BrokenChild /></ErrorBoundary>);

    expect(screen.getByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument();
    expect(screen.getByText(/reintentar la operación/i)).toBeInTheDocument();
    expect(screen.getByText(/recarga la página/i)).toBeInTheDocument();
    expect(screen.getByText(/contacta a soporte/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar página' })).toBeInTheDocument();

    expect(screen.queryByText(internalMessage)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/\.env\.local|Firebase Console|FIREBASE_SETUP\.md|npm run dev/i);
    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: internalMessage }),
      expect.objectContaining({ componentStack: expect.any(String), type: 'react-error-boundary' })
    );
  });

  it('conserva el diagnóstico técnico de Firebase en desarrollo', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(<ErrorBoundary><BrokenChild /></ErrorBoundary>);

    expect(screen.getByRole('heading', { name: /Error de configuración Firebase/i })).toBeInTheDocument();
    expect(screen.getByText(internalMessage)).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/\.env\.local/);
    expect(document.body).toHaveTextContent(/npm run dev/);
  });

  it('vuelve a renderizar children al reintentar', () => {
    vi.stubEnv('NODE_ENV', 'production');
    let shouldThrow = true;
    const Child = () => {
      if (shouldThrow) throw new Error('fallo temporal');
      return <p>Contenido recuperado</p>;
    };

    render(<ErrorBoundary><Child /></ErrorBoundary>);
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('Contenido recuperado')).toBeInTheDocument();
  });
});
