
import { MOCK_EVENTS } from './lib/constants';
import { EventListSchema } from './lib/schemas';

console.log("--- Validating MOCK_EVENTS ---");

const result = EventListSchema.safeParse(MOCK_EVENTS);

if (result.success) {
  console.log("Validation Successful!");
} else {
  console.error("Validation Failed!");
  console.error(JSON.stringify(result.error.format(), null, 2));
}
