import test from "node:test";
import assert from "node:assert/strict";
import { checkOutboxWorkerAccess } from "../src/lib/server/outbox-worker-access.ts";

const enabled = {
  authorizationHeader: "Bearer " + "A".repeat(40),
  expectedSecret: "A".repeat(40),
  deliveryEnabled: "true",
  signatureDispatchEnabled: "true",
  supabaseServiceKey: "service-only-key",
  resendApiKey: "re_test_not_real",
  senderEmail: "signature@example.org",
  appOrigin: "https://onosign.example.org",
};

test("delivery always stays locked unless both independent flags are enabled", () => {
  for (const [deliveryEnabled, signatureDispatchEnabled] of [
    [undefined, undefined], ["false", "true"], ["true", "false"],
    ["TRUE", "true"], ["true", "TRUE"],
  ]) {
    assert.equal(
      checkOutboxWorkerAccess({ ...enabled, deliveryEnabled, signatureDispatchEnabled }),
      "disabled"
    );
  }
});

test("the worker refuses absent credentials and weak secrets", () => {
  assert.equal(checkOutboxWorkerAccess({ ...enabled, expectedSecret: "short" }), "configuration");
  assert.equal(checkOutboxWorkerAccess({ ...enabled, supabaseServiceKey: undefined }), "configuration");
  assert.equal(checkOutboxWorkerAccess({ ...enabled, resendApiKey: undefined }), "configuration");
  assert.equal(checkOutboxWorkerAccess({ ...enabled, appOrigin: undefined }), "configuration");
});

test("only the exact constant-time bearer secret opens the worker gate", () => {
  assert.equal(checkOutboxWorkerAccess(enabled), "authorized");
  assert.equal(checkOutboxWorkerAccess({ ...enabled, authorizationHeader: null }), "forbidden");
  assert.equal(checkOutboxWorkerAccess({
    ...enabled, authorizationHeader: "Bearer " + "B".repeat(40),
  }), "forbidden");
  assert.equal(checkOutboxWorkerAccess({
    ...enabled, authorizationHeader: "Bearer " + "A".repeat(39),
  }), "forbidden");
  assert.equal(checkOutboxWorkerAccess({
    ...enabled, authorizationHeader: "Basic " + "A".repeat(40),
  }), "forbidden");
});
