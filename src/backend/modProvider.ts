export interface ModSearchResult { id: string; name: string; author?: string; thumbnailUrl?: string; summary?: string; }
export interface ModSearchPage { results: ModSearchResult[]; page: number; pageSize: number; total?: number; hasMore: boolean; }
export interface ModProvider { search(query: string, page: number, pageSize: number): Promise<ModSearchPage>; }
export class CurseForgeModProvider implements ModProvider {
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async search(query: string, page: number, pageSize: number): Promise<ModSearchPage> {
    if (!this.apiKey) throw new Error('CurseForge mod search is not configured. Set CURSEFORGE_API_KEY.');
    const p = new URLSearchParams({ gameId: '83374', searchFilter: query, index: String((page - 1) * pageSize), pageSize: String(pageSize), sortField: 'Popularity', sortOrder: 'desc' });
    const r = await this.fetchImpl(`https://api.curseforge.com/v1/mods/search?${p}`, { headers: { 'x-api-key': this.apiKey, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`CurseForge search failed (${r.status})`);
    const b: any = await r.json(); const data = Array.isArray(b.data) ? b.data : []; const total = b.pagination?.totalCount;
    return { page, pageSize, total, hasMore: total === undefined ? data.length === pageSize : (page - 1) * pageSize + data.length < total, results: data.map((m: any) => ({ id: String(m.id), name: m.name || String(m.id), author: m.authors?.[0]?.name, thumbnailUrl: m.logo?.url, summary: m.summary })) };
  }
}
