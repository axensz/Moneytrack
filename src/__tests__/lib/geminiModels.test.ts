import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterTextModels,
  loadGeminiModels,
  findModelOption,
  clearGeminiModelsCache,
  FALLBACK_GEMINI_MODELS,
} from '../../lib/geminiModels';
import { setGeminiApiKey } from '../../lib/geminiClient';

const LONG_KEY = 'AIzaSyAFAKEKEY1234567890abcdefGHIJ';

/** Respuesta de ejemplo de ListModels con familias mezcladas. */
const SAMPLE_LIST_MODELS = {
  models: [
    {
      name: 'models/gemini-3.5-flash',
      displayName: 'Gemini 3.5 Flash',
      description: 'Flash estable',
      inputTokenLimit: 1_048_576,
      outputTokenLimit: 65_536,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
    },
    {
      name: 'models/gemini-2.5-pro',
      displayName: 'Gemini 2.5 Pro',
      inputTokenLimit: 2_000_000,
      outputTokenLimit: 8_192,
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-4-argon',
      displayName: 'Gemini 4 Argon',
      inputTokenLimit: 1_000_000,
      outputTokenLimit: 65_536,
      supportedGenerationMethods: ['generateContent'],
    },
    // --- EXCLUIR: no tiene generateContent ---
    {
      name: 'models/text-embedding-004',
      displayName: 'Embedding 004',
      supportedGenerationMethods: ['embedContent'],
    },
    // --- EXCLUIR: familias no aplicables aunque tengan generateContent ---
    {
      name: 'models/gemini-2.5-flash-tts',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-2.5-flash-image',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/nano-banana-pro',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-2.5-flash-native-audio',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-live-2.5-flash',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-robotics-er',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-2.5-computer-use',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/lyria-realtime',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-2.5-deep-research',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-audio-transcribe',
      supportedGenerationMethods: ['generateContent'],
    },
  ],
};

describe('filterTextModels', () => {
  it('devuelve solo los modelos de texto con generateContent y excluye las familias no aplicables', () => {
    const result = filterTextModels(SAMPLE_LIST_MODELS);
    const ids = result.map((m) => m.id);

    expect(ids).toEqual(
      expect.arrayContaining(['gemini-3.5-flash', 'gemini-2.5-pro', 'gemini-4-argon']),
    );
    expect(ids).toHaveLength(3);

    // Nada de TTS, imagen, embeddings, audio nativo, live, robotics, etc.
    for (const excluded of [
      'text-embedding-004',
      'gemini-2.5-flash-tts',
      'gemini-2.5-flash-image',
      'nano-banana-pro',
      'gemini-2.5-flash-native-audio',
      'gemini-live-2.5-flash',
      'gemini-robotics-er',
      'gemini-2.5-computer-use',
      'lyria-realtime',
      'gemini-2.5-deep-research',
      'gemini-audio-transcribe',
    ]) {
      expect(ids).not.toContain(excluded);
    }
  });

  it('ordena los flash antes que los pro', () => {
    const result = filterTextModels(SAMPLE_LIST_MODELS);
    const flashIdx = result.findIndex((m) => m.id.includes('flash'));
    const proIdx = result.findIndex((m) => m.id.includes('pro'));
    expect(flashIdx).toBeGreaterThanOrEqual(0);
    expect(proIdx).toBeGreaterThanOrEqual(0);
    expect(flashIdx).toBeLessThan(proIdx);
  });

  it('deriva una etiqueta del id cuando no hay displayName y mapea límites/descripcion', () => {
    const result = filterTextModels({
      models: [
        {
          name: 'models/gemini-4-argon',
          inputTokenLimit: 1_000_000,
          outputTokenLimit: 65_536,
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('gemini-4-argon');
    expect(result[0].label).toBe('Gemini 4 Argon');
    expect(result[0].inputTokenLimit).toBe(1_000_000);
    expect(result[0].outputTokenLimit).toBe(65_536);
  });

  it('maneja respuestas vacías o nulas sin romper', () => {
    expect(filterTextModels(null)).toEqual([]);
    expect(filterTextModels({ models: [] })).toEqual([]);
  });
});

describe('loadGeminiModels', () => {
  beforeEach(() => {
    clearGeminiModelsCache();
    setGeminiApiKey('');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearGeminiModelsCache();
    setGeminiApiKey('');
  });

  it('usa el respaldo estático cuando no hay key (sin llamar a la red)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await loadGeminiModels();
    expect(result).toBe(FALLBACK_GEMINI_MODELS);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('consulta ListModels con la key y devuelve la lista filtrada', async () => {
    setGeminiApiKey(LONG_KEY);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_LIST_MODELS), { status: 200 }),
    );

    const result = await loadGeminiModels();
    expect(result.map((m) => m.id)).toEqual(
      expect.arrayContaining(['gemini-3.5-flash', 'gemini-2.5-pro', 'gemini-4-argon']),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).toContain(`key=${LONG_KEY}`);
  });

  it('cachea el resultado para la misma key (no re-consulta)', async () => {
    setGeminiApiKey(LONG_KEY);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_LIST_MODELS), { status: 200 }),
    );

    await loadGeminiModels();
    await loadGeminiModels();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('cae al respaldo estático si la consulta falla', async () => {
    setGeminiApiKey(LONG_KEY);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const result = await loadGeminiModels();
    expect(result).toBe(FALLBACK_GEMINI_MODELS);
  });

  it('cae al respaldo estático si la respuesta no es ok', async () => {
    setGeminiApiKey(LONG_KEY);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 }),
    );

    const result = await loadGeminiModels();
    expect(result).toBe(FALLBACK_GEMINI_MODELS);
  });

  it('cae al respaldo estático si la lista filtrada queda vacía', async () => {
    setGeminiApiKey(LONG_KEY);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }] }), { status: 200 }),
    );

    const result = await loadGeminiModels();
    expect(result).toBe(FALLBACK_GEMINI_MODELS);
  });
});

describe('findModelOption', () => {
  it('encuentra un modelo presente', () => {
    const models = filterTextModels(SAMPLE_LIST_MODELS);
    expect(findModelOption(models, 'gemini-4-argon')?.id).toBe('gemini-4-argon');
  });

  it('devuelve undefined para un modelo retirado (degrada con elegancia)', () => {
    const models = filterTextModels(SAMPLE_LIST_MODELS);
    expect(findModelOption(models, 'gemini-retirado-99')).toBeUndefined();
  });
});
