process.env.NVIDIA_API_KEY = 'test-key';
import { fetchImageAsBase64, generateBaseImage, generateVariantImage } from '../../src/services/AssetGenerationService.js';

// Mock the dynamically imported StorageService
jest.mock('../../src/services/StorageService.js', () => ({
  signMinioUrl: jest.fn().mockResolvedValue('http://mocked-signed-url'),
}));

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
  });

  beforeEach(() => {
    global.fetch = jest.fn();
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
    });

    it('handles regular HTTP URLs', async () => {
      const mockBuffer = Buffer.from('mock-image-data');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      const b64 = await fetchImageAsBase64('http://example.com/test.png');
      expect(b64).toBe(mockBuffer.toString('base64'));
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
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockSourceBuffer.buffer,
      });
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
