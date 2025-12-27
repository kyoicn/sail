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
  const cleanName = filename.replace(/^File:/i, '').replace(/\s+/g, '_');
  return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${cleanName}`;
}

/**
 * Normalizes various Wikimedia URL formats into our standard Special:Redirect format.
 * This ensures that duplicate checks work reliably.
 */
export function canonicalizeWikimediaUrl(url: string | undefined): string {
  if (!url) return '';

  // If it's already a Special:Redirect URL, just ensure underscores
  if (url.includes('Special:Redirect/file/')) {
    const filename = url.split('Special:Redirect/file/').pop() || '';
    return constructWikimediaUrl(filename);
  }

  // Handle Wikipedia/Commons direct links like /wiki/File:Battle_of_Paris.jpg
  if (url.includes('/wiki/File:')) {
    const filename = url.split('/wiki/File:').pop() || '';
    return constructWikimediaUrl(filename);
  }

  // Handle upload.wikimedia.org links (extract the filename from the last part)
  if (url.includes('upload.wikimedia.org')) {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    return constructWikimediaUrl(filename);
  }

  return url;
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
