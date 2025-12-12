import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Adjust path
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[2]
if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))

from shared.models import EventSchema
from src.parser_web import is_valid_url
from src.extractor_event import extract_events
from src.enricher_orchestrator import LLMOrchestrator

class TestEventPipeline(unittest.TestCase):

    def test_url_validation(self):
        self.assertTrue(is_valid_url("https://example.com"))
        self.assertFalse(is_valid_url("not a url"))

    @patch('src.extractor_event.ollama.Client')
    def test_extract_events(self, mock_client_cls):
        # Mock client instance and chat response
        mock_client = MagicMock()
        mock_response = {
            'message': {
                'content': """
                    {
                        "events": [
                            {
                                "event_title": "Test Event",
                                "event_description": "A test event description.",
                                "start_time": {"year": 2023},
                                "location": {
                                    "latitude": "",
                                    "longitude": "",
                                    "location_name": "Test Loction", 
                                    "certainty": "approximate"
                                }
                            }
                        ]
                    }
                """
            }
        }
        mock_client.chat.return_value = mock_response
        mock_client_cls.return_value = mock_client

        events = extract_events("Some dummy text content that mentions a Test Event in 2023.","llama3")
        
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].title, "Test Event")
        self.assertEqual(events[0].start_time.year, 2023)
        self.assertIsNone(events[0].location.latitude)

    @patch('src.enricher_orchestrator.ollama.Client')
    def test_enricher(self, mock_client_cls):
        mock_client = MagicMock()
        # Mock LLM response: first turn asks for tool, second turn provides answer
        # For simplicity, let's just mock immediate answer
        mock_response = {
            'message': {
                'tool_calls': None, # or []
                'content': """
                    {
                        "event_title": "Test Event Enriched",
                        "event_description": "A test event description.",
                        "start_time": {"year": 2023},
                        "location": {
                            "latitude": 48.8566,
                            "longitude": 2.3522,
                            "location_name": "Paris",
                            "certainty": "definite"
                        },
                        "importance": 5.0
                    }
                """
            }
        }
        mock_client.chat.return_value = mock_response
        mock_client_cls.return_value = mock_client

        # Create a dummy input event (missing lat/lon)
        input_event = EventSchema(
            event_title="Test Event",
            event_description="Desc",
            start_time={'year': 2023},
            location={'latitude': None, 'longitude': None}
        )
        
        orchestrator = LLMOrchestrator("llama3")
        enriched = orchestrator.enrich_events([input_event])
        
        self.assertEqual(len(enriched), 1)
        self.assertEqual(enriched[0].location.latitude, 48.8566)
        self.assertEqual(enriched[0].location.location_name, "Paris")

if __name__ == '__main__':
    unittest.main()
