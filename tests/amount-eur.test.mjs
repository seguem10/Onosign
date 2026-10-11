import test from "node:test";
import assert from "node:assert/strict";
import { parseEurAmount, parsePositiveEurThreshold } from "../src/lib/amount-eur.ts";

test("DI and DR amounts accept zero and both sides of the EUR 20,000 boundary", () => {
  for (const amount of [0, 4999.99, 5000, 19999.99, 20000, 20000.01, 50000]) {
    assert.equal(parseEurAmount(String(amount)), amount);
  }
});

test("French decimal separator, whitespace and cents are normalized", () => {
  assert.equal(parseEurAmount("  20000,01  "), 20000.01);
  assert.equal(parseEurAmount("0,00"), 0);
  assert.equal(parseEurAmount("123.4"), 123.4);
  assert.equal(parseEurAmount("999999999999.99"), 999999999999.99);
});

test("invalid amount input is never silently interpreted as zero", () => {
  for (const bad of ["", " ", "-1", "+12", "12,345", "12.345", "12,3.4", "20 000", "1e5", "Infinity", "NaN", "1000000000000", "20.000,00", "€20", "12/34"]) {
    assert.equal(parseEurAmount(bad), null, bad);
  }
});

test("DI thresholds must be strictly positive, unlike DR amount zero", () => {
  assert.equal(parsePositiveEurThreshold("0"), null);
  assert.equal(parsePositiveEurThreshold("0,00"), null);
  assert.equal(parsePositiveEurThreshold("-1"), null);
  assert.equal(parsePositiveEurThreshold("20000"), 20000);
  assert.equal(parsePositiveEurThreshold("20000,01"), 20000.01);
});
