# **Technical Design Doc: Event Extraction & Enrichment Tool**

## **1\. Context & Scope**

The goal is to build a robust **Event Extraction & Enrichment Tool** that transforms raw user inputs—specifically **URLs** or **Text**—into fully structured EventSchema objects.

The system operates in two distinct stages:

1. **Ingestion**: Parsing raw content from a User URL or Text to extract the "Event Concept" (clean text).
2. **Extraction**: Extracting events from the clean text from step 1, and produce EventSchema with the extracted events while some fields may be empty for step 3 to populate.
3. **Enrichment**: Using **Local LLMs** to analyze the EventSchema and the clean text, provide data, or act as Orchestrators (Agents) to trigger external search tools for missing data (coordinates, media and so on), and populate the final schema.

## **2\. Shared Data Models**

**Location:** data-pipeline/shared/models.py

To ensure consistency across the ecosystem, we utilize the centralized schema definitions. We strictly adhere to the following entities imported from the shared library.

*Note: No data models will be redefined in this project's source code.*

## **3\. System Architecture**

### **3.1 High-Level Data Flow**

sequenceDiagram  
    participant User  
    participant MainApp  
    participant ContentParser  
    participant DataProvider (Enrichment)  
    participant LocalLLM  
    participant SearchTool

    Note over User, MainApp: Stage 1: Ingestion  
    User-\>\>MainApp: Input URL or Text (e.g., "wikipedia.org/wiki/Battle\_of\_Hastings" or "Battle of Hastings")  
    MainApp-\>\>ContentParser: fetch\_and\_parse(url)  
    ContentParser--\>\>MainApp: Clean Text

    Note over MainApp, EventExtractor: Stage 2: Extraction  
    MainApp-\>\>EventExtractor: extract\_events(clean\_text)  
    EventExtractor--\>\>MainApp: EventSchema

    Note over MainApp, DataProvider, SearchTool: Stage 2: Enrichment  
    MainApp-\>\>DataProvider: enrich\_event(clean\_text)  
      
    loop Reasoning Loop  
        DataProvider-\>\>LocalLLM: Prompt with Clean Text \+ Tool Defs  
        LocalLLM-\>\>DataProvider: Request: Search("Where is Hailesaltede? What's the lat/lng?")  
        DataProvider-\>\>SearchTool: Execute Query  
        SearchTool--\>\>DataProvider: Return Results  
        DataProvider-\>\>LocalLLM: Feed Observation  
    end  
      
    LocalLLM-\>\>DataProvider: Final JSON (EventSchema)  
    DataProvider--\>\>MainApp: Structured Object

### **3.2 Component Design**

#### **A. Content Parser Module (src/parser/)**

**Responsibility:** Turn a noisy web page or input text into clean, machine-readable text to serve as the "ground truth" for the next steps.

* **scraper.py**:  
  * **Input**: URL string (--url) or raw text (--text).  
  * **Logic**:  
    1. Validates URL schema (if URL is provided).  
    2. Fetches HTML content (if URL is provided).  
    3. Extracts main article body, removing boilerplate/nav/ads and other unrelated noise.  
  * **Output**: A clean string \> 100 characters (the "Event Concept").  
  * **Fallback**: If parsing fails, returns error to User.

#### **B. Event Extractor Module (src/extractor/)**

**Responsibility:** Extract events from the clean text.

* **event_extractor.py**:  
  * **Input**: Clean text.  
  * **Logic**:  
    1. Validates clean text.  
    2. Extracts all mentioned events from the clean text.  
  * **Output**: A list of events (EventSchema).

#### **C. Data Provider Module (src/data\_provider/)**

**Responsibility:** The intelligence layer. It takes the events (EventSchema) and enriches them.

* **interface.BaseDataProvider**: Defines the contract.  
  * enrich\_event(event: EventSchema) \-\> EventSchema  
  * enrich\_events(events: List\[EventSchema\]) \-\> List\[EventSchema\]  
* **orchestrator.LLMOrchestrator**: The implementation that manages the "Enrichment Loop".  
  * **Responsibility**: Maintains the chat history, parses LLM tool calls (JSON mode), executes Python functions, and validates the final schema against share/models.py.

#### **D. Tools Layer (src/tools/)**

Standalone, stateless functions injected into the LLM context during the Enrichment phase.

* **search.py**:  
  * Wraps external search APIs.  
  * **Output**: Returns a list of result dictionaries {title, snippet, link, source}.

### **3.3 Technology Stack Selection**

| Component | Technology / Library | Reasoning |
| :---- | :---- | :---- |
| **Parsing Engine** | **trafilatura** (Primary) | Superior to BeautifulSoup for extracting main article text and discarding boilerplate/ads. |
| **Parsing Fallback** | **readability-lxml** | Robust fallback if trafilatura fails on specific HTML structures. |
| **LLM Runtime** | **Ollama** | Simplest local deployment for Llama 3 / Mistral. Exposes an OpenAI-compatible API. |
| **LLM Client** | **openai (Python SDK)** | Standard, robust client to communicate with the local Ollama server. |
| **Search Tool** | **duckduckgo-search** | No API key required for development; privacy-focused. Good enough for factual lookup. |
| **Search (Prod)** | **Google Custom Search JSON API** | (Optional) Configurable fallback for higher reliability in production. |
| **Data Validation** | **pydantic** | Already used in share/models.py. Ensures strictly typed outputs from the LLM. |
| **HTTP Client** | **httpx** | Modern, async-capable HTTP client for the Parser and API calls. |

### **4\. Implementation Details**

#### **4.1 The Integration Pipeline (src/main.py logic)**

The main entry point acts as the controller:

def process\_user\_request(input\_str: str):  
    \# 1\. Determine Strategy  
    if is\_url(input\_str):  
        \# Stage 1: Parse using Trafilatura  
        clean\_context \= parser.extract\_text(input\_str)  
    else:  
        \# Assume raw query is the context  
        clean\_context \= input\_str

    \# 2\. Enrich (The LLM+Search Loop)  
    event\_object \= provider.enrich\_event(clean\_context)  
      
    return event\_object

#### **4.2 The "Tool Loop" Logic (ReAct)**

1. **System Prompt**: "You are a historian. Analyze the following context: {clean\_context}. Use search\_tool to find missing coordinates or images. Reply with JSON..."  
2. **Execution**: Python parses the JSON. If it's a tool call, run it, append output to history, and recurse.  
3. **Extraction**: When final\_answer is received, parse it into the share/models.py schema.

## **5\. Risks & Trade-offs**

| Trade-off | Decision | Reasoning |
| :---- | :---- | :---- |
| **Parsing Quality** | **trafilatura** | While trafilatura is state-of-the-art for text extraction, it may miss content on JS-heavy sites (SPA). *Mitigation:* We assume users provide article-like URLs, not complex web apps. |
| **Local vs. Cloud LLM** | **Local First** | Ensures privacy and zero cost. We accept slightly higher latency. |
| **Search Reliability** | **Aggregated Search** | The LLM acts as a filter to discard irrelevant "SEO spam" before populating the event object. |

## **6\. Next Steps**

1. Implement src/parser/web\_scraper.py using trafilatura.  
2. Setup src/data\_provider/orchestrator.py using openai SDK targeting local Ollama.  
3. Implement src/tools/search.py using duckduckgo-search.  
4. Integration test: URL \-\> Parse \-\> Enrich \-\> JSON.