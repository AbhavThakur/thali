import assert from "node:assert/strict";
import { test } from "node:test";
import { cmToFtIn, ftInToCm } from "../units.ts";

test("feet and inches convert to centimetres", () => {
  assert.equal(ftInToCm(5, 3), 160);
  assert.equal(ftInToCm(5, 10), 178);
  assert.equal(ftInToCm(6, 0), 183);
  assert.equal(ftInToCm(5, 14), ftInToCm(6, 2), "inches carry over");
});

test("centimetres convert back to feet and inches", () => {
  assert.deepEqual(cmToFtIn(160), { ft: 5, inch: 3 });
  assert.deepEqual(cmToFtIn(178), { ft: 5, inch: 10 });
  assert.deepEqual(cmToFtIn(182.9), { ft: 6, inch: 0 });
});

test("a round trip stays within a centimetre", () => {
  for (let cm = 120; cm <= 220; cm++) {
    const { ft, inch } = cmToFtIn(cm);
    assert.ok(Math.abs(ftInToCm(ft, inch) - cm) <= 1, `${cm} cm`);
    assert.ok(inch >= 0 && inch <= 11);
  }
});
