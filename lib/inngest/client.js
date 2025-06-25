import { Inngest } from "inngest";

// Create with explicit name and better debugging
export const inngest = new Inngest({
  id: "splitr",
  name: "Splitr App",
  eventKey: process.env.INNGEST_EVENT_KEY
});