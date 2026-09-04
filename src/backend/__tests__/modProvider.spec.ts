import { CurseForgeModProvider } from '../modProvider';

describe('CurseForgeModProvider', () => {
  it('uses server-side pagination and maps metadata', async () => {
    const fetchMock: any = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 12, name: 'Example', authors: [{ name: 'Author' }], logo: { url: 'thumb' } }], pagination: { index: 12, pageSize: 12, totalCount: 30 } }) });
    const result = await new CurseForgeModProvider('key', fetchMock).search('example', 2, 12);
    expect(fetchMock.mock.calls[0][0]).toContain('index=12');
    expect(result.hasMore).toBe(true);
    expect(result.results[0]).toMatchObject({ id: '12', name: 'Example', author: 'Author', thumbnailUrl: 'thumb' });
  });
  it('reports configuration and API errors', async () => {
    await expect(new CurseForgeModProvider('').search('x', 1, 12)).rejects.toThrow('not configured');
    const fetchMock: any = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(new CurseForgeModProvider('key', fetchMock).search('x', 1, 12)).rejects.toThrow('429');
  });
});
