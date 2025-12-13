import logging
from urllib.parse import urlparse
import trafilatura
from readability import Document
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def is_valid_url(url: str) -> bool:
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except ValueError:
        return False

def fetch_and_parse(url: str) -> str:
    """
    Fetches content from a URL and extracts the main text.
    Uses trafilatura as primary extractor, falls back to readability-lxml.
    """
    if not is_valid_url(url):
        raise ValueError(f"Invalid URL provided: {url}")

    logger.info(f"Fetching and parsing: {url}")
    
    # Try trafilatura first (it handles network and extraction)
    downloaded = trafilatura.fetch_url(url)
    
    if downloaded:
        text = trafilatura.extract(downloaded, favor_recall=True, include_tables=True)
        if text and len(text) > 100:
            logger.info("Successfully extracted text using trafilatura")
            return text
    
    logger.warning("Trafilatura failed or returned empty text. Falling back to readability.")

    # Fallback to httpx + readability
    try:
        response = httpx.get(url, timeout=10.0, follow_redirects=True)
        response.raise_for_status()
        
        doc = Document(response.text)
        # summary() gives the HTML of the main content, we might want text
        # But readability is primarily for getting the main HTML content. 
        # We can use BeautifulSoup to strip tags from doc.summary() or use high-level abstraction if available.
        # Let's extract text from the summary.
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(doc.summary(), 'html.parser')
        text = soup.get_text(separator='\n', strip=True)
        
        if len(text) > 100:
             logger.info("Successfully extracted text using readability backup")
             return text
        
    except Exception as e:
        logger.error(f"Readability fallback failed: {e}")

    raise RuntimeError(f"Failed to extract meaningful text from {url}")
