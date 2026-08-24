// ============================================================
// Unit tests for the M23/M32 CDN content-fetch helpers, focused on
// fetchChunkFromContentUrl's payload-shape contract:
//   - a valid payload requires a non-empty `nodes` record AND a present
//     `leaves` record (empty `{}` leaves is allowed for terminal chunks)
//   - array-valued or malformed sections are rejected (returns null)
// ============================================================

import { DialogueNode, Leaf } from '@las-flores/shared';
import { fetchChunkFromContentUrl, fetchNodesFromContentUrl } from '../../src/services/contentFetch.js';
import { fetchContentJson } from '../../src/services/StorageService.js';

jest.mock('../../src/services/StorageService.js', () => ({
  fetchContentJson: jest.fn(),
}));

const mockFetch = fetchContentJson as jest.Mock<any>;

const NODE: DialogueNode = { id: 'n1', text: 'hi' } as unknown as DialogueNode;
const LEAF: Leaf = { type: 'FREE', target_node_id: 'n1' } as unknown as Leaf;

const FALLBACK = { nodes: { stale: NODE }, leaves: { stale: LEAF } };

describe('fetchChunkFromContentUrl payload validation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('accepts a valid chunk with non-empty nodes and non-empty leaves', async () => {
    mockFetch.mockResolvedValue({ nodes: { n1: NODE }, leaves: { l1: LEAF } });
    await expect(fetchChunkFromContentUrl('cdn://chunk', FALLBACK)).resolves.toEqual({
      nodes: { n1: NODE },
      leaves: { l1: LEAF },
    });
  });

  it('accepts a terminal chunk whose leaves map is empty', async () => {
    mockFetch.mockResolvedValue({ nodes: { n1: NODE }, leaves: {} });
    const result = await fetchChunkFromContentUrl('cdn://chunk', FALLBACK);
    expect(result).toEqual({ nodes: { n1: NODE }, leaves: {} });
  });

  it('returns null for an empty nodes map', async () => {
    mockFetch.mockResolvedValue({ nodes: {}, leaves: {} });
    await expect(fetchChunkFromContentUrl('cdn://chunk', FALLBACK)).resolves.toBeNull();
  });

  it('returns null when the nodes section is missing', async () => {
    mockFetch.mockResolvedValue({ leaves: { l1: LEAF } });
    await expect(fetchChunkFromContentUrl('cdn://chunk', FALLBACK)).resolves.toBeNull();
  });

  it('returns null when the leaves section is missing', async () => {
    mockFetch.mockResolvedValue({ nodes: { n1: NODE } });
    await expect(fetchChunkFromContentUrl('cdn://chunk', FALLBACK)).resolves.toBeNull();
  });

  it('rejects array-valued sections instead of treating them as maps', async () => {
    // Arrays of plain objects pass naive Object.keys checks; they must not
    // reach the resolver as node/leaf maps.
    mockFetch.mockResolvedValue({
      nodes: [{ id: 'n1' }] as unknown as Record<string, DialogueNode>,
      leaves: [{ type: 'FREE' }] as unknown as Record<string, Leaf>,
    });
    await expect(fetchChunkFromContentUrl('cdn://chunk', FALLBACK)).resolves.toBeNull();
  });

  it('returns null for a null parsed payload', async () => {
    mockFetch.mockResolvedValue(null);
    await expect(fetchChunkFromContentUrl('cdn://chunk', FALLBACK)).resolves.toBeNull();
  });

  it('returns null when content_url is missing', async () => {
    await expect(fetchChunkFromContentUrl(null, FALLBACK)).resolves.toBeNull();
  });
});

describe('fetchNodesFromContentUrl payload validation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('rejects array-valued nodes sections', async () => {
    mockFetch.mockResolvedValue({ nodes: [{ id: 'n1' }] as unknown as Record<string, DialogueNode> });
    await expect(fetchNodesFromContentUrl('cdn://tree', {})).resolves.toBeNull();
  });

  it('accepts an explicitly emptied tree (nodes: {})', async () => {
    mockFetch.mockResolvedValue({ nodes: {} });
    await expect(fetchNodesFromContentUrl('cdn://tree', { stale: NODE })).resolves.toEqual({});
  });
});
