import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getCustomFoods,
  getProfile,
  loadCustomFoods,
  saveCustomFood,
} from "../src/db/db.ts";
import { newCustomFoodId } from "../src/domain/customFood.ts";
import { allFoods, FOOD_BY_ID } from "../src/domain/foods.ts";
import { INGREDIENTS } from "../src/domain/ingredients.ts";
import {
  formatQty,
  isAllowed,
  macroLine,
  macrosFor,
} from "../src/domain/nutrition.ts";
import {
  buildRecipeFood,
  EMPTY_RECIPE,
  ingredientGrams,
  toRecipeInput,
  type RecipeInput,
} from "../src/domain/recipe.ts";
import type { DietType, Food } from "../src/domain/types.ts";
import { syncCommunity } from "../src/ui/communitySync.ts";
import { haptic } from "../src/ui/haptics.ts";
import { usePeople } from "../src/ui/People.tsx";
import { Sheet, sheetStyles } from "../src/ui/Sheet.tsx";
import { card, colors } from "../src/ui/theme.ts";
import { useToast } from "../src/ui/Toast.tsx";

type Row = { foodId: string; grams: string };

const num = (s: string) => Number(s.trim().replace(",", "."));

export default function RecipeScreen() {
  const db = useSQLiteContext();
  const toast = useToast();
  const { people } = usePeople();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [form, setForm] = useState<RecipeInput>(EMPTY_RECIPE);
  const [rows, setRows] = useState<Row[]>([]);
  const [diet, setDiet] = useState<DietType | null>(null);
  const [existing, setExisting] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setDiet((await getProfile(db))?.dietType ?? null);
      const own = await getCustomFoods(db);
      setExisting(own.map((f) => f.id));
      const saved = id ? own.find((f) => f.id === id) : undefined;
      const input = saved ? toRecipeInput(saved) : null;
      if (input) {
        setForm(input);
        setRows(
          input.items.map((it) => ({
            foodId: it.foodId,
            grams: String(
              Math.round((FOOD_BY_ID[it.foodId]?.measure.grams ?? 1) * it.qty),
            ),
          })),
        );
      }
    })();
  }, [db, id]);

  // Each row is typed in grams, which is how people weigh; the recipe stores household quantities.
  const items = useMemo(
    () =>
      rows.map((r) => ({
        foodId: r.foodId,
        qty: FOOD_BY_ID[r.foodId]
          ? num(r.grams) / FOOD_BY_ID[r.foodId].measure.grams
          : 0,
      })),
    [rows],
  );
  const draft = useMemo(
    () => buildRecipeFood({ ...form, items }, id ?? "preview"),
    [form, items, id],
  );
  const rawGrams = Math.round(
    ingredientGrams(items.filter((it) => it.qty > 0)),
  );

  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taken = new Set(rows.map((r) => r.foodId));
    return [...INGREDIENTS, ...allFoods()]
      .filter(
        (f) =>
          f.id !== id &&
          !taken.has(f.id) &&
          (!diet || isAllowed(f, diet)) &&
          (!q || f.name.toLowerCase().includes(q)),
      )
      .slice(0, 40);
  }, [query, rows, diet, id]);

  const addIngredient = (f: Food) => {
    haptic.tap();
    setRows((r) => [...r, { foodId: f.id, grams: String(f.measure.grams) }]);
    setPicking(false);
    setQuery("");
  };

  const save = async () => {
    if ("error" in draft) {
      haptic.warn();
      return setError(draft.error);
    }
    const food = { ...draft.food, id: id ?? newCustomFoodId(existing) };
    await saveCustomFood(db, food);
    await loadCustomFoods(db);
    void syncCommunity(people, true);
    haptic.success();
    toast(`${food.name} saved`);
    router.back();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: id ? "Edit recipe" : "New recipe" }} />
      <View style={card}>
        <Text style={styles.title}>Your recipe</Text>
        <Text style={styles.muted}>
          Add what goes into the pot, weigh the finished dish, and say how many
          servings it makes. Then you can log a katori of it in two taps.
        </Text>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(name) => setForm((f) => ({ ...f, name }))}
          placeholder="Amma's dal"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Recipe name"
        />
      </View>

      <View style={card}>
        <Text style={styles.title}>Ingredients</Text>
        <Text style={styles.muted}>
          Raw weight, before cooking. Oil and ghee count too.
        </Text>
        {rows.map((r, i) => {
          const food = FOOD_BY_ID[r.foodId];
          if (!food) return null;
          const g = num(r.grams);
          return (
            <View key={r.foodId} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{food.name}</Text>
                <Text style={styles.muted}>
                  {g > 0 ? `≈ ${formatQty(food, g / food.measure.grams)}` : " "}
                </Text>
              </View>
              <TextInput
                style={styles.gramsInput}
                value={r.grams}
                keyboardType="decimal-pad"
                selectTextOnFocus
                onChangeText={(grams) =>
                  setRows((all) =>
                    all.map((x, j) => (j === i ? { ...x, grams } : x)),
                  )
                }
                accessibilityLabel={`${food.name} in grams`}
              />
              <Text style={styles.unit}>g</Text>
              <Pressable
                hitSlop={10}
                onPress={() => setRows((all) => all.filter((_, j) => j !== i))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${food.name}`}
              >
                <Text style={styles.x}>✕</Text>
              </Pressable>
            </View>
          );
        })}
        <Pressable
          style={styles.add}
          onPress={() => setPicking(true)}
          accessibilityRole="button"
        >
          <Text style={styles.addText}>+ Add ingredient</Text>
        </Pressable>
      </View>

      <View style={card}>
        <Text style={styles.title}>The finished dish</Text>
        <Text style={styles.label}>Weight of the whole dish (g)</Text>
        <TextInput
          style={styles.input}
          value={form.cookedGrams}
          onChangeText={(cookedGrams) =>
            setForm((f) => ({ ...f, cookedGrams }))
          }
          keyboardType="decimal-pad"
          placeholder={
            rawGrams ? `Raw ingredients weigh ${rawGrams} g` : "e.g. 900"
          }
          placeholderTextColor={colors.muted}
          accessibilityLabel="Cooked weight in grams"
        />
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Makes how many servings</Text>
            <TextInput
              style={styles.input}
              value={form.servings}
              onChangeText={(servings) => setForm((f) => ({ ...f, servings }))}
              keyboardType="decimal-pad"
              placeholder="6"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Number of servings"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>One serving is a…</Text>
            <TextInput
              style={styles.input}
              value={form.unit}
              onChangeText={(unit) => setForm((f) => ({ ...f, unit }))}
              placeholder="katori"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Serving name"
            />
          </View>
        </View>
        <Text style={[styles.muted, { marginTop: 8 }]}>
          Weigh the pot after cooking, minus the empty pot. Water that boiled
          away or soaked in is already part of that weight.
        </Text>
      </View>

      <View style={[card, styles.preview]}>
        {"food" in draft ? (
          <>
            <Text style={styles.previewTitle}>
              1 {draft.food.measure.unit} ({draft.food.measure.grams} g)
            </Text>
            <Text style={styles.previewKcal}>
              {Math.round(macrosFor(draft.food, 1).kcal)} kcal
            </Text>
            <Text style={styles.muted}>
              {macroLine(macrosFor(draft.food, 1))}
            </Text>
          </>
        ) : (
          <Text style={styles.muted}>
            Fill in the recipe to see the calories for one serving.
          </Text>
        )}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Pressable style={styles.save} onPress={save} accessibilityRole="button">
        <Text style={styles.saveText}>Save recipe</Text>
      </Pressable>
      <Text style={[styles.muted, styles.note]}>
        Like your other foods, a saved recipe is sent without your name to
        Thali's shared list once it has been checked.
      </Text>

      <Sheet visible={picking} onClose={() => setPicking(false)}>
        <Text style={sheetStyles.title}>Add an ingredient</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search toor dal, onion, oil…"
          placeholderTextColor={colors.muted}
          autoFocus
          accessibilityLabel="Search ingredients"
        />
        <ScrollView
          style={{ maxHeight: 360, marginTop: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {choices.map((f) => (
            <Pressable
              key={f.id}
              style={styles.choice}
              onPress={() => addIngredient(f)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${f.name}`}
            >
              <Text style={styles.name}>{f.name}</Text>
              <Text style={styles.muted}>
                {Math.round(f.per100g.kcal)} kcal per 100 g
              </Text>
            </Pressable>
          ))}
          {choices.length === 0 ? (
            <Text style={[styles.muted, { paddingVertical: 12 }]}>
              Nothing matches. Try a shorter word.
            </Text>
          ) : null}
        </ScrollView>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 17, fontWeight: "800", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  formRow: { flexDirection: "row", gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
    marginTop: 4,
  },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  gramsInput: {
    width: 72,
    textAlign: "center",
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.text,
  },
  unit: { fontSize: 14, color: colors.muted },
  x: { fontSize: 16, color: colors.muted, paddingHorizontal: 4 },
  add: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 22,
    paddingVertical: 11,
    alignItems: "center",
  },
  addText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
  preview: { alignItems: "center", gap: 2 },
  previewTitle: { fontSize: 14, fontWeight: "700", color: colors.muted },
  previewKcal: { fontSize: 28, fontWeight: "800", color: colors.text },
  error: {
    color: colors.danger,
    marginHorizontal: 16,
    marginTop: 4,
    fontWeight: "600",
  },
  save: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  note: { marginHorizontal: 16, marginTop: 10 },
  choice: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.track,
  },
});
