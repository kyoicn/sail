/**
 * Detects Wikipedia/Wikimedia Commons file pages and transforms them into direct image redirect URLs.
 * 
 * Example:
 * https://en.wikipedia.org/wiki/File:Battle_of_Waterloo_-_Sadler.jpg
 * ->
 * https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Battle_of_Waterloo_-_Sadler.jpg
 */
export function constructWikimediaUrl(filename: string): string {
  if (!filename) return '';
  // Remove "File:" prefix if present
  const cleanName = filename.replace(/^File:/i, '');
  return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${cleanName}`;
}

export interface WikimediaSearchResult {
  filename: string;
  snippet: string;
}

export async function getWikimediaSearchResults(query: string, limit: number = 10): Promise<WikimediaSearchResult[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&format=json&origin=*&srlimit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Wikimedia API failed');
    const data = await response.json();

    // Namespace 6 is "File" in MediaWiki
    return (data.query?.search || []).map((item: any) => ({
      filename: item.title,
      snippet: item.snippet.replace(/<\/?[^>]+(>|$)/g, "") // Remove HTML tags
    }));
  } catch (error) {
    console.error('Error searching Wikimedia:', error);
    return [];
  }
}
