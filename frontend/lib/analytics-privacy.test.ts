import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
const source = readFileSync("public/analytics-privacy.js", "utf8");
function handler(navigator = {}) {
 const window: {holoBeforeSend?: (type: string, payload: Record<string, unknown>) => unknown} = {};
 runInNewContext(source, {window, navigator, URL, location: {origin: "https://holo.example", hostname: "holo.example"}});
 return window.holoBeforeSend!;
}
describe("analytics privacy boundary", () => {
 it("excludes room secrets and arbitrary content from page views", () => {
  const output = handler()("event", {website:"public-site-id",url:"/room/secret-room?token=secret#private",title:"private file",referrer:"https://private.example/secret",data:{message:"secret text"},language:"en",screen:"1280x800"});
  expect(output).toEqual({website:"public-site-id",hostname:"holo.example",url:"/room/[roomId]",title:"Holo",referrer:"",language:"en",screen:"1280x800"});
 });
 it("drops custom events and error payloads", () => {
  expect(handler()("event",{name:"private-file.pdf"})).toBe(false);
  expect(handler()("error",{message:"secret"})).toBe(false);
 });
 it("respects opt-out signals", () => {
  expect(handler({doNotTrack:"1"})("event",{})).toBe(false);
  expect(handler({globalPrivacyControl:true})("event",{})).toBe(false);
 });
});
