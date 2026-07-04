process.env.NVIDIA_API_KEY = 'test-key';

// Mock the dynamically imported StorageService using ESM mock
// This must be done BEFORE importing the module under test
import { jest } from '@jest/globals';

const mockSignMinioUrl = jest.fn().mockResolvedValue('http://mocked-signed-url');
const mockUploadToMinio = jest.fn().mockResolvedValue('s3://mock-bucket/mock-key');
const mockDeleteFromMinio = jest.fn().mockResolvedValue(undefined);

function exactArrayBuffer(value: Buffer | string): ArrayBuffer {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

jest.doMock('../../src/services/StorageService.js', () => ({
  signMinioUrl: mockSignMinioUrl,
  uploadToMinio: mockUploadToMinio,
  deleteFromMinio: mockDeleteFromMinio,
  default: {
    signMinioUrl: mockSignMinioUrl,
    uploadToMinio: mockUploadToMinio,
    deleteFromMinio: mockDeleteFromMinio,
  },
}));

let fetchImageAsBase64: any;
let generateBaseImage: any;
let generateVariantImage: any;

describe('AssetGenerationService', () => {
  let originalFetch: typeof global.fetch;
  let originalSetTimeout: typeof global.setTimeout;
  let originalAbortSignal: typeof AbortSignal;

  beforeAll(async () => {
    const module = await import('../../src/services/AssetGenerationService.ts');
    fetchImageAsBase64 = module.fetchImageAsBase64;
    generateBaseImage = module.generateBaseImage;
    generateVariantImage = module.generateVariantImage;

    originalFetch = global.fetch;
    originalSetTimeout = global.setTimeout;
    originalAbortSignal = global.AbortSignal;
    (global as any).setTimeout = (cb: Function) => { cb(); return 0; };
    // Mock AbortSignal.timeout to return a non-aborted signal
    // This prevents the mocked setTimeout from causing immediate aborts
    (global as any).AbortSignal = {
      ...global.AbortSignal,
      timeout: (ms: number) => {
        const controller = new AbortController();
        return controller.signal;
      },
    };
    // Initialize global.fetch as a mock for the first time
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
    global.AbortSignal = originalAbortSignal;
  });

  beforeEach(() => {
    mockSignMinioUrl.mockClear();
    mockUploadToMinio.mockClear();
    mockDeleteFromMinio.mockClear();
    global.fetch = jest.fn();
  });

  describe('fetchImageAsBase64', () => {

    it('handles s3:// URLs', async () => {
      const mockBuffer = Buffer.from('mock-image-data');
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: async () => exactArrayBuffer(mockBuffer),
        text: async () => 'mock text',
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const b64 = await fetchImageAsBase64('s3://las-flores/test.png');
      expect(b64).toBe(mockBuffer.toString('base64'));
      expect(mockSignMinioUrl).toHaveBeenCalledWith('s3://las-flores/test.png', 900);
      expect(global.fetch).toHaveBeenCalledWith('http://mocked-signed-url', expect.anything());
    });

    it('handles regular HTTP URLs', async () => {
      const mockBuffer = Buffer.from('mock-image-data');
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: async () => exactArrayBuffer(mockBuffer),
        text: async () => 'mock text',
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const b64 = await fetchImageAsBase64('http://example.com/test.png');
      console.log('fetchImageAsBase64 result:', b64);
      console.log('expected:', mockBuffer.toString('base64'));
      expect(b64).toBe(mockBuffer.toString('base64'));
      expect(mockSignMinioUrl).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith('http://example.com/test.png', expect.anything());
    });
  });

  describe('generateBaseImage', () => {
    it('calls NIM with correct params', async () => {
      const mockBuffer = Buffer.from('mock-image-data'.repeat(1000));
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          artifacts: [{ base64: mockBuffer.toString('base64'), finishReason: 'SUCCESS' }],
        }),
        text: async () => 'mock text',
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await generateBaseImage({ prompt: 'test', width: 1024, height: 1024 });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('falls back to Pollinations on failure', async () => {
      const mockBuffer = Buffer.from('mock-image-data'.repeat(1000));
      for(let i=0; i<6; i++) {
        (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error(`NIM Error ${i}`)));
      }
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: async () => exactArrayBuffer(mockBuffer),
        text: async () => 'mock text',
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);
      
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
      const mockSourceResponse = {
        ok: true,
        status: 200,
        arrayBuffer: async () => exactArrayBuffer(mockSourceBuffer),
        text: async () => 'mock text',
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockSourceResponse);
      // Second call is for NIM i2i
      const mockNimResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          artifacts: [{ base64: mockOutBuffer.toString('base64'), finishReason: 'SUCCESS' }],
        }),
        text: async () => 'mock text',
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockNimResponse);

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
      const mockSourceResponse = {
        ok: true,
        status: 200,
        arrayBuffer: async () => exactArrayBuffer('source-image-data'),
        text: async () => 'mock text',
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockSourceResponse);
      for(let i=0; i<6; i++) {
        (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('NIM fetch failure')));
      }
      const mockOutBuffer = Buffer.from('out-image-data'.repeat(1000));
      const mockPollinationsResponse = {
        ok: true,
        status: 200,
        arrayBuffer: async () => exactArrayBuffer(mockOutBuffer),
        text: async () => 'mock text',
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockPollinationsResponse);

      const result = await generateVariantImage({
        prompt: 'variant',
        sourceImageUrl: 'http://example.com/base.png',
        strength: 0.5,
      });
      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
