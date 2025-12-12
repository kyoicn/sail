import logging
from duckduckgo_search import DDGS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def search_web(query: str, max_results: int = 5) -> list[dict]:
    """
    Searches the web using DuckDuckGo and returns a list of results.
    Each result dict contains 'title', 'href', 'body'.
    """
    logger.info(f"Searching web for: {query}")
    results = []
    try:
        with DDGS() as ddgs:
            # text() returns an iterator
            search_results = ddgs.text(query, max_results=max_results)
            for r in search_results:
                results.append({
                    "title": r.get("title"),
                    "link": r.get("href"),
                    "snippet": r.get("body")
                })
        logger.info(f"Found {len(results)} results.")
        return results
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return []
