import { getCalendarEvents } from "./src/repositories/liveRepository.js";
async function test() {
  const result = await getCalendarEvents(2026, 4);
  console.log(JSON.stringify(result, null, 2));
}
test();
