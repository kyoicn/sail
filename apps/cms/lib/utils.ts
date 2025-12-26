/**
 * Detects Wikipedia/Wikimedia Commons file pages and transforms them into direct image redirect URLs.
 * 
 * Example:
 * https://en.wikipedia.org/wiki/File:Battle_of_Waterloo_-_Sadler.jpg
 * ->
 * https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Battle_of_Waterloo_-_Sadler.jpg
 */
export function fixWikimediaUrl(url: string): string {
  if (!url) return url;

  // 1. Wikipedia/Wikimedia File pages
  // e.g. en.wikipedia.org/wiki/File:..., commons.wikimedia.org/wiki/File:...
  const wikiFilePattern = /^(https?:\/\/)?([a-z0-9-]+\.)?(wikipedia|wikimedia)\.org\/wiki\/File:(.+)$/i;
  let match = url.match(wikiFilePattern);
  if (match) {
    const fileName = match[4];
    return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${fileName}`;
  }

  // 2. upload.wikimedia.org (thumbnails or direct)
  // e.g. https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Massachusetts_1775_map.jpg/800px-Massachusetts_1775_map.jpg
  // e.g. https://upload.wikimedia.org/wikipedia/commons/f/f1/Massachusetts_1775_map.jpg
  const uploadPattern = /^(https?:\/\/)?upload\.wikimedia\.org\/wikipedia\/commons\/(thumb\/)?[a-f0-9]\/[a-f0-9]{2}\/([^\/]+)(\/.*)?$/i;
  match = url.match(uploadPattern);
  if (match) {
    const fileName = match[3];
    return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${fileName}`;
  }

  return url;
}
