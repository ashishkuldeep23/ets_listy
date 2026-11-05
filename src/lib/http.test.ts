import { describe, expect, it } from "vitest";
import { readJson, readOptionalJson } from "@/lib/http";
import { LIMITS } from "@/lib/limits";

// Reading request bodies: bad or oversized input must never throw or fill memory.

const post = (body?: BodyInit, headers?: Record<string, string>) =>
  new Request("http://localhost/x", {
    method: "POST",
    body,
    headers,
    // Node needs this for a streamed body.
    ...(body instanceof ReadableStream && { duplex: "half" }),
  } as RequestInit);

const tooBig = JSON.stringify({ name: "x".repeat(LIMITS.REQUEST_BODY_MAX_BYTES) });

/** A body that doesn't announce its size, the way a chunked request wouldn't. */
function chunked(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 1024) controller.enqueue(bytes.slice(i, i + 1024));
      controller.close();
    },
  });
}

describe("readJson", () => {
  it("parses valid JSON, including text split between chunks", async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
    const hindi = "दूध".repeat(1000);
    expect(await readJson(post(chunked(JSON.stringify({ hindi }))))).toEqual({ hindi });
  });

  it("returns undefined for bad, empty and missing bodies", async () => {
    expect(await readJson(post("{oops"))).toBeUndefined();
    expect(await readJson(post(""))).toBeUndefined();
    expect(await readJson(post())).toBeUndefined();
  });

  it("refuses a body over the limit, announced or not", async () => {
    expect(await readJson(post(tooBig))).toBeUndefined();
    expect(await readJson(post(chunked(tooBig)))).toBeUndefined();
    expect(await readJson(post("{}", { "content-length": String(LIMITS.REQUEST_BODY_MAX_BYTES + 1) }))).toBeUndefined();
  });
});

describe("readOptionalJson", () => {
  it("treats an empty body as null", async () => {
    expect(await readOptionalJson(post())).toBeNull();
    expect(await readOptionalJson(post("   "))).toBeNull();
  });

  it("parses valid JSON and refuses bad or oversized bodies", async () => {
    expect(await readOptionalJson(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readOptionalJson(post("{oops"))).toBeUndefined();
    expect(await readOptionalJson(post(chunked(tooBig)))).toBeUndefined();
  });
});
