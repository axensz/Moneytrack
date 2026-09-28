import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiKeyModal } from '../../components/modals/GeminiKeyModal';

const contextMock = vi.hoisted(() => ({
  apiKey: 'AIzaSyAFAKEKEY1234567890abcdefGHIJ',
  isConfigured: true,
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  hasConsent: true,
  setConsent: vi.fn(),
  selectedModel: 'gemini-3.5-flash' as const,
  setSelectedModel: vi.fn(),
}));

vi.mock('../../contexts/GeminiKeyContext', () => ({
  useGeminiKey: () => contextMock,
}));

vi.mock('../../utils/toastHelpers', () => ({
  showToast: { success: vi.fn(), error: vi.fn() },
}));

describe('GeminiKeyModal', () => {
  beforeEach(() => {
    contextMock.saveApiKey.mockReset();
    contextMock.clearApiKey.mockReset();
    contextMock.setConsent.mockReset();
    contextMock.setSelectedModel.mockReset();
  });

  it('shows stable compatible models, their limits and the official usage dashboard', () => {
    render(<GeminiKeyModal isOpen onClose={vi.fn()} />);

    const model = screen.getByRole('combobox', { name: 'Modelo Gemini' });
    expect(model).toHaveValue('gemini-3.5-flash');
    expect(screen.getByRole('option', { name: /Gemini 3.8 Flash/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Gemini 3.5 Flash-Lite/i })).toBeInTheDocument();
    expect(screen.getByText('1.048.576 tokens', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('65.536 tokens', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver consumo y cuotas/i }))
      .toHaveAttribute('href', 'https://aistudio.google.com/usage');
    expect(screen.getByText(/no existe un saldo de tokens por API key/i)).toBeInTheDocument();
  });

  it('saves the key and one selected model together', () => {
    const onClose = vi.fn();
    render(<GeminiKeyModal isOpen onClose={onClose} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Modelo Gemini' }), {
      target: { value: 'gemini-3.8-flash' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(contextMock.saveApiKey).toHaveBeenCalledWith(contextMock.apiKey);
    expect(contextMock.setSelectedModel).toHaveBeenCalledWith('gemini-3.8-flash');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
