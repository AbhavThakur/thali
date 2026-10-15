import assert from "node:assert/strict";
import { test } from "node:test";
import { bmiCategory, weightGuide } from "../bmi.ts";

test("uses Asian BMI cut-offs", () => {
  assert.equal(bmiCategory(18.4), "underweight");
  assert.equal(bmiCategory(22.9), "healthy");
  assert.equal(bmiCategory(23), "overweight");
  assert.equal(bmiCategory(25), "obese");
});

test("160 cm, 70 kg: obese band, healthy range 48–58, three targets", () => {
  const g = weightGuide(160, 70);
  assert.equal(g.category, "obese");
  assert.equal(g.healthyMinKg, 48);
  assert.equal(g.healthyMaxKg, 58);
  assert.deepEqual(
    g.options.map((o) => o.kg),
    [67, 63, 58],
  );
});

test("targets are below current weight and never under BMI 18.5", () => {
  for (const [h, w] of [
    [150, 52],
    [175, 80],
    [160, 49],
    [190, 140],
  ] as const) {
    const g = weightGuide(h, w);
    for (const o of g.options) {
      assert.ok(o.kg < w);
      assert.ok(o.kg >= g.healthyMinKg);
    }
    assert.equal(new Set(g.options.map((o) => o.kg)).size, g.options.length);
  }
});

test("no weight-loss targets for an underweight person", () => {
  const g = weightGuide(165, 48);
  assert.equal(g.category, "underweight");
  assert.deepEqual(g.options, []);
});
