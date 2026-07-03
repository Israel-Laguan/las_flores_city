process.env.NVIDIA_API_KEY = 'test-key';

// Mock the dynamically imported StorageService using ESM mock
// This must be done BEFORE importing the module under test
import { jest } from '@jest/globals';

const mockSignMinioUrl = jest.fn().mockResolvedValue('http://mocked-signed-url');
const mockUploadToMinio = jest.fn().mockResolvedValue('s3://mock-bucket/mock-key');
const mockDeleteFromMinio = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/services/StorageService.js', () => ({
  signMinioUrl: mockSignMinioUrl,
  uploadToMinio: mockUploadToMinio,
  deleteFromMinio: mockDeleteFromMinio,
  default: {
    signMinioUrl: mockSignMinioUrl,
    uploadToMinio: mockUploadToMinio,
    deleteFromMinio: mockDeleteFromMinio,
  },
}));

import { fetchImageAsBase64, generateBaseImage, generateVariantImage } from '../../src/services/AssetGenerationService.js';

describe('AssetGenerationService', () => {
  let originalFetch: typeof global.fetch;
  let originalSetTimeout: typeof global.setTimeout;

  beforeAll(() => {
    originalFetch = global.fetch;
    originalSetTimeout = global.setTimeout;
    (global as any).setTimeout = (cb: Function) => { cb(); return 0; };
  });

  afterAll(() => {
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    global.fetch = jest.fn();
    mockSignMinioUrl.mockClear();
    mockUploadToMinio.mockClear();
    mockDeleteFromMinio.mockClear();
    jest.clearAllMocks();
  });

  describe('fetchImageAsBase64', () => {
    it('handles s3:// URLs', async () => {
      const mockBuffer = Buffer.from('mock-image-data');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      const b64 = await fetchImageAsBase64('s3://las-flores/test.png');
      expect(b64).toBe(mockBuffer.toString('base64'));
      expect(mockSignMinioUrl).toHaveBeenCalledWith('s3://las-flores/test.png', 900);
      expect(global.fetch).toHaveBeenCalledWith('http://mocked-signed-url', expect.anything());
    });

    it('handles regular HTTP URLs', async () => {
      const mockBuffer = Buffer.from('mock-image-data');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      const b64 = await fetchImageAsBase64('http://example.com/test.png');
      expect(b64).toBe(mockBuffer.toString('base64'));
      expect(mockSignMinioUrl).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith('http://example.com/test.png', expect.anything());
    });
  });

  describe('generateBaseImage', () => {
    it('calls NIM with correct params', async () => {
      const mockBuffer = Buffer.from('mock-image-data'.repeat(1000));
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          artifacts: [{ base64: mockBuffer.toString('base64'), finishReason: 'SUCCESS' }],
        }),
      });

      const result = await generateBaseImage({ prompt: 'test', width: 1024, height: 1024 });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('falls back to Pollinations on failure', async () => {
      const mockBuffer = Buffer.from('mock-image-data'.repeat(1000));
      for(let i=0; i<6; i++) {
        (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error(`NIM Error ${i}`)));
      }
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });
      
      const result = await generateBaseImage({ prompt: 'test', width: 1024, height: 1024 });
      expect(result).toBeInstanceOf(Buffer);
      expect(global.fetch).toHaveBeenCalledTimes(7);
    });
  });

  describe('generateVariantImage', () => {
    it('fetches base image, passes as base64', async () => {
      const mockSourceBuffer = Buffer.from('source-image-data');
      const mockOutBuffer = Buffer.from('out-image-data'.repeat(1000));
      
      // First call is for fetching the source image
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockSourceBuffer.buffer,
      });
      // Second call is for NIM i2i
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          artifacts: [{ base64: mockOutBuffer.toString('base64'), finishReason: 'SUCCESS' }],
        }),
      });

      const result = await generateVariantImage({
        prompt: 'variant',
        sourceImageUrl: 'http://example.com/base.png',
        strength: 0.5,
      });
      
      expect(result).toBeInstanceOf(Buffer);
      const nimCall = (global.fetch as jest.Mock).mock.calls[1];
      expect(nimCall[1].body).toContain('"strength":0.5');
    });

    it('falls back to Pollinations i2i on failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('source-image-data').buffer,
      });
      for(let i=0; i<6; i++) {
        (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('NIM fetch failure')));
      }
      const mockOutBuffer = Buffer.from('out-image-data'.repeat(1000));
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockOutBuffer.buffer,
      });

      const result = await generateVariantImage({
        prompt: 'variant',
        sourceImageUrl: 'http://example.com/base.png',
        strength: 0.5,
      });
      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
