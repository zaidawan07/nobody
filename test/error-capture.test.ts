import assert from "node:assert/strict";
import test from "node:test";

import { describeConsoleErrorArgument, describeError } from "../src/lib/error-capture";

test("error descriptions retain only safe metadata and numeric stack locations", () => {
  const cause = new Error("provider body contains customer phone +923001234567");
  const error = new Error("request failed with access_token=super-secret", { cause });
  Object.assign(error, { status: 502 });
  error.name = "Error secret=do-not-log";
  Object.defineProperty(error, "stack", {
    value:
      "Error: access_token=super-secret\n  at handler (https://provider.invalid/path?token=abc&phone=+923001234567:40:8)",
  });

  const description = describeError(error);

  assert.match(description, /^Error \(status 502\)/);
  assert.match(description, /frame 1 at 40:8/);
  assert.doesNotMatch(
    description,
    /super-secret|access_token|customer phone|\+923001234567|provider body|provider\.invalid|token=abc/,
  );
});

test("non-Error throws are not serialized into logs", () => {
  assert.equal(describeError({ token: "secret" }), "NonError thrown (details omitted)");
});

test("console error strings and objects are omitted instead of passed through", () => {
  assert.equal(
    describeConsoleErrorArgument("Authorization: Bearer sensitive-value"),
    "[error log text omitted]",
  );
  assert.equal(
    describeConsoleErrorArgument({ payload: "customer phone +923001234567" }),
    "[error log value omitted]",
  );
});
