import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addLogs,
  getFavouriteIds,
  getLastQuantities,
  getLogs,
  getProfile,
  getRecentFoodIds,
  loadCustomFoods,
  saveCustomFood,
  toggleFavourite,
  today,
} from "../src/db/db.ts";
import { calorieTarget, macroTargets } from "../src/domain/energy.ts";
import { dayImpact, explainFood } from "../src/domain/explain.ts";
import { allFoods, FOOD_BY_ID } from "../src/domain/foods.ts";
import {
  describeServing,
  formatQty,
  gramsFor,
  isAllowed,
  macrosFor,
  qtyFromGrams,
  sumMacros,
} from "../src/domain/nutrition.ts";
import { SLOTS } from "../src/domain/plan.ts";
import { searchFoods } from "../src/domain/search.ts";
import {
  buildQuickFood,
  EMPTY_QUICK_ADD,
  newQuickFoodId,
  type QuickAddInput,
} from "../src/domain/quickAdd.ts";
import type { DietType, Food, Macros, SlotId } from "../src/domain/types.ts";
import { freshSession, getCloud, loadSession } from "../src/ui/cloudSync.ts";
import { PromptSheet, Sheet, sheetStyles } from "../src/ui/Sheet.tsx";
import { colors } from "../src/ui/theme.ts";
import { haptic } from "../src/ui/haptics.ts";
import { useToast } from "../src/ui/Toast.tsx";

export default function AddFood() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ slot?: string; date?: string }>();
  const slot = (SLOTS.find((s) => s.id === params.slot)?.id ??
    "snack") as SlotId;
  // History passes the day being filled in; anything invalid or in the future means today.
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") &&
    (params.date as string) <= today()
      ? (params.date as string)
      : today();
  const [diet, setDiet] = useState<DietType | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Food | null>(null);
  const [qty, setQty] = useState(1);
  // People who weigh their food can type grams; the log still stores household quantities.
  const [byGrams, setByGrams] = useState(false);
  const [gramsText, setGramsText] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [lastQty, setLastQty] = useState<Record<string, number>>({});
  const [favourites, setFavourites] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [quick, setQuick] = useState<QuickAddInput | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [day, setDay] = useState<{ consumed: Macros; target: Macros } | null>(
    null,
  );
  const [showWhy, setShowWhy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      const p = await getProfile(db);
      if (!p) return;
      setDiet(p.dietType);
      const logs = await getLogs(db, date);
      setDay({
        target: macroTargets(p, calorieTarget(p).kcal),
        consumed: sumMacros(
          logs
            .filter((l) => FOOD_BY_ID[l.food_id])
            .map((l) => macrosFor(FOOD_BY_ID[l.food_id], l.qty)),
        ),
      });
    })();
    getRecentFoodIds(db).then(setRecent);
    getLastQuantities(db).then(setLastQty);
  }, [db, date]);

  // Foods created on the My foods screen show up when coming back here.
  useFocusEffect(
    useCallback(() => {
      getFavouriteIds(db).then(setFavourites);
      setTick((t) => t + 1);
    }, [db]),
  );

  const results = useMemo(() => {
    if (!diet) return [];
    return searchFoods(
      allFoods().filter((f) => isAllowed(f, diet)),
      query,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, diet, tick]);

  const pickable = (ids: string[]) =>
    diet
      ? [...new Set(ids.map((id) => FOOD_BY_ID[id]?.id))]
          .map((id) => FOOD_BY_ID[id as string])
          .filter((f): f is Food => !!f && !f.quick && isAllowed(f, diet))
      : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recentFoods = useMemo(() => pickable(recent), [recent, diet, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const favouriteFoods = useMemo(
    () => pickable(favourites),
    [favourites, diet, tick],
  );
  const isFavourite = !!selected && favourites.includes(selected.id);

  const onFavourite = async () => {
    if (!selected) return;
    haptic.tap();
    await toggleFavourite(db, selected.id);
    setFavourites(await getFavouriteIds(db));
  };

  const pick = (f: Food) => {
    haptic.tap();
    setSelected(f);
    const last = lastQty[f.id];
    setQty(last && last >= 0.5 && last <= 20 ? last : 1);
    setByGrams(false);
    setShowWhy(false);
  };

  const stepQty = (delta: number) => {
    if (!selected) return;
    setServings(Math.max(0.5, qty + delta));
  };

  const setServings = (next: number) => {
    if (!selected) return;
    setQty(next);
    if (byGrams) setGramsText(String(gramsFor(selected, next)));
  };

  const toggleGrams = () => {
    if (!selected) return;
    haptic.tap();
    if (!byGrams) setGramsText(String(gramsFor(selected, qty)));
    setByGrams(!byGrams);
  };

  const typeGrams = (text: string) => {
    setGramsText(text);
    const g = Number(text.replace(",", "."));
    if (selected && g > 0 && g <= 3000) setQty(qtyFromGrams(selected, g));
  };

  const saveQuick = async () => {
    if (!quick || busy) return;
    const built = buildQuickFood(quick, newQuickFoodId());
    if ("error" in built) {
      haptic.warn();
      return setQuickError(built.error);
    }
    setBusy(true);
    try {
      await saveCustomFood(db, built.food);
      await loadCustomFoods(db);
      await addLogs(db, date, [{ slot, foodId: built.food.id, qty: 1 }]);
      haptic.success();
      toast(`${built.food.name} added`);
      router.back();
    } catch {
      setBusy(false);
      toast("Could not add that. Please try again.");
    }
  };

  const add = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await addLogs(db, date, [{ slot, foodId: selected.id, qty }]);
      haptic.success();
      toast(`${selected.name} added`);
      router.back();
    } catch {
      setBusy(false);
      toast("Could not add that. Please try again.");
    }
  };

  const shown = selected ? macrosFor(selected, qty) : null;
  const impact =
    selected && shown && day && !selected.quick
      ? dayImpact(day.consumed, day.target, shown)
      : null;

  return (
    <View style={styles.screen}>
      <Text style={styles.muted}>
        Adding to {SLOTS.find((s) => s.id === slot)?.label}
        {date !== today()
          ? ` on ${new Date(`${date}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`
          : ""}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Search dal, roti, idli…"
        value={query}
        onChangeText={setQuery}
        autoFocus
        accessibilityLabel="Search foods"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <Pressable
        style={styles.quickLink}
        onPress={() => {
          setQuickError(null);
          setQuick({ ...EMPTY_QUICK_ADD, name: query.trim() });
        }}
        accessibilityRole="button"
        accessibilityLabel="Quick add calories"
      >
        <Text style={styles.link}>⚡ Can't find it? Quick add calories</Text>
      </Pressable>
      <FlatList
        data={results}
        keyExtractor={(f) => f.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          !query.trim() && (recentFoods.length || favouriteFoods.length) ? (
            <View style={styles.recentWrap}>
              {favouriteFoods.length ? (
                <>
                  <Text style={styles.section}>Favourites</Text>
                  <View style={styles.recentRow}>
                    {favouriteFoods.map((f) => (
                      <Pressable
                        key={f.id}
                        onPress={() => pick(f)}
                        style={[
                          styles.recentChip,
                          selected?.id === f.id && styles.recentChipOn,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${f.name}, favourite`}
                      >
                        <Text
                          style={[
                            styles.recentText,
                            selected?.id === f.id && { color: "#fff" },
                          ]}
                        >
                          ♥ {f.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
              {recentFoods.length ? (
                <>
                  <Text style={styles.section}>Recent</Text>
                  <View style={styles.recentRow}>
                    {recentFoods.map((f) => (
                      <Pressable
                        key={f.id}
                        onPress={() => pick(f)}
                        style={[
                          styles.recentChip,
                          selected?.id === f.id && styles.recentChipOn,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${f.name}, recently eaten`}
                      >
                        <Text
                          style={[
                            styles.recentText,
                            selected?.id === f.id && { color: "#fff" },
                          ]}
                        >
                          {f.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
              <Text style={styles.section}>All foods</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          diet ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                No match for “{query.trim()}”
              </Text>
              <Text style={styles.muted}>
                Try a shorter word, like “dal” or “roti”. Foods that don't fit
                your diet are hidden.
              </Text>
              <Pressable
                style={styles.create}
                onPress={() =>
                  router.push({
                    pathname: "/foods",
                    params: { name: query.trim() },
                  })
                }
                accessibilityRole="button"
              >
                <Text style={styles.createText}>
                  + Add {query.trim() ? `“${query.trim()}”` : "it"} as your own
                  food
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => pick(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: selected?.id === item.id }}
            accessibilityLabel={`${item.name}, ${Math.round(macrosFor(item, 1).kcal)} kilocalories per ${describeServing(item, 1)}`}
            style={[
              styles.row,
              selected?.id === item.id && { backgroundColor: colors.tint },
            ]}
          >
            <Text style={styles.name}>
              {item.name}
              {item.community ? (
                <Text style={styles.checked}> ✓ Checked</Text>
              ) : null}
            </Text>
            <Text style={styles.muted}>
              {describeServing(item, 1)} · {Math.round(macrosFor(item, 1).kcal)}{" "}
              kcal · P {Math.round(macrosFor(item, 1).protein)} g
            </Text>
          </Pressable>
        )}
      />
      {selected && shown && (
        <View style={styles.preview} accessibilityLiveRegion="polite">
          <View style={styles.previewTop}>
            <Text style={styles.bigKcal}>
              {Math.round(shown.kcal)}
              <Text style={styles.bigUnit}> kcal</Text>
            </Text>
            <View style={styles.chips}>
              {(
                [
                  ["Protein", shown.protein],
                  ["Carbs", shown.carbs],
                  ["Fat", shown.fat],
                  ["Fiber", shown.fiber],
                ] as [string, number][]
              ).map(([label, g]) => (
                <View key={label} style={styles.macroChip}>
                  <Text style={styles.macroValue}>{Math.round(g)} g</Text>
                  <Text style={styles.macroLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
          {impact ? (
            <Text
              style={[styles.impact, impact.over && { color: colors.danger }]}
            >
              {impact.kcal} {impact.protein}
            </Text>
          ) : null}
          {!byGrams && (
            <View style={styles.qtyRow}>
              {[0.5, 1, 1.5, 2, 3].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    haptic.tap();
                    setServings(n);
                  }}
                  style={[styles.qtyChip, qty === n && styles.recentChipOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatQty(selected, n)}`}
                  accessibilityState={{ selected: qty === n }}
                >
                  <Text
                    style={[styles.recentText, qty === n && { color: "#fff" }]}
                  >
                    {n === 0.5 ? "½" : n === 1.5 ? "1½" : n}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            onPress={() => setShowWhy((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.link}>
              {showWhy ? "Hide" : "How is this calculated?"}
            </Text>
          </Pressable>
          {showWhy &&
            explainFood(selected, qty).map((line) => (
              <Text key={line} style={styles.why}>
                {line}
              </Text>
            ))}
        </View>
      )}
      {selected && (
        <View style={styles.footer}>
          <Pressable
            onPress={() => stepQty(-0.5)}
            style={styles.step}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Less ${selected.name}`}
          >
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            {byGrams ? (
              <View style={styles.gramsRow}>
                <TextInput
                  style={styles.gramsInput}
                  value={gramsText}
                  onChangeText={typeGrams}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Weight in grams"
                  selectTextOnFocus
                />
                <Text style={styles.name}>g</Text>
              </View>
            ) : (
              <Text style={styles.name}>{describeServing(selected, qty)}</Text>
            )}
            <Pressable
              onPress={toggleGrams}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                byGrams ? "Use servings instead" : "Enter weight in grams"
              }
            >
              <Text style={styles.link}>
                {byGrams ? "Use servings" : "Enter grams"}
              </Text>
            </Pressable>
            {selected.community ? (
              <Pressable
                onPress={() => setReporting(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Report wrong values for ${selected.name}`}
              >
                <Text style={styles.report}>Report a problem</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={onFavourite}
            style={styles.heart}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={
              isFavourite
                ? `Remove ${selected.name} from favourites`
                : `Add ${selected.name} to favourites`
            }
          >
            <Text
              style={[
                styles.heartText,
                isFavourite && { color: colors.danger },
              ]}
            >
              {isFavourite ? "♥" : "♡"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => stepQty(0.5)}
            style={styles.step}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`More ${selected.name}`}
          >
            <Text style={styles.stepText}>+</Text>
          </Pressable>
          <Pressable
            onPress={add}
            disabled={busy}
            style={[styles.addBtn, busy && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={`Add ${formatQty(selected, qty)} of ${selected.name}`}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Add</Text>
          </Pressable>
        </View>
      )}
      <Sheet visible={!!quick} onClose={() => setQuick(null)}>
        <Text style={sheetStyles.title}>Quick add</Text>
        <Text style={sheetStyles.sub}>
          Just the calories for what you ate. Protein, carbs and fat are
          optional. This stays on your phone and isn't added to your foods.
        </Text>
        {quick && (
          <>
            {(
              [
                ["name", "What was it? (optional)", false],
                ["kcal", "Calories (kcal)", true],
                ["protein", "Protein (g, optional)", true],
                ["carbs", "Carbs (g, optional)", true],
                ["fat", "Fat (g, optional)", true],
              ] as [keyof QuickAddInput, string, boolean][]
            ).map(([k, label, numeric]) => (
              <View key={k} style={{ marginTop: 8 }}>
                <Text style={styles.quickLabel}>{label}</Text>
                <TextInput
                  style={styles.quickInput}
                  value={quick[k]}
                  onChangeText={(v) => {
                    setQuick((q) => (q ? { ...q, [k]: v } : q));
                    setQuickError(null);
                  }}
                  keyboardType={numeric ? "decimal-pad" : "default"}
                  placeholder={numeric ? "" : "Biryani at a restaurant"}
                  placeholderTextColor={colors.muted}
                  accessibilityLabel={label}
                />
              </View>
            ))}
            {quickError ? (
              <Text style={styles.quickError} accessibilityLiveRegion="polite">
                {quickError}
              </Text>
            ) : null}
          </>
        )}
        <Pressable
          style={[sheetStyles.save, busy && { opacity: 0.6 }]}
          onPress={saveQuick}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={sheetStyles.saveText}>
            Add to {SLOTS.find((s) => s.id === slot)?.label}
          </Text>
        </Pressable>
      </Sheet>
      <PromptSheet
        visible={reporting}
        title="What looks wrong?"
        subtitle={`Tell us about ${selected?.name ?? "this food"}, for example “calories look too high”. We check it and fix it for everyone.`}
        initial=""
        validate={(v) =>
          v.trim().length < 3 ? "Add a few words about what is wrong." : null
        }
        onClose={() => setReporting(false)}
        onSave={async (message) => {
          if (!selected) return;
          try {
            if (!loadSession())
              throw new Error(
                "Turn on Cloud backup (Me tab) first, so we know the report is from a real person.",
              );
            await getCloud().reportFood(
              await freshSession(),
              selected.id,
              message,
            );
            setReporting(false);
            toast("Thanks, we will check it");
          } catch (e) {
            setReporting(false);
            toast(e instanceof Error ? e.message : "Could not send that.");
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  muted: { fontSize: 13, color: colors.muted },
  gramsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  preview: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.track,
  },
  previewTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  bigKcal: { fontSize: 30, fontWeight: "800", color: colors.text },
  bigUnit: { fontSize: 14, fontWeight: "600", color: colors.muted },
  chips: { flex: 1, flexDirection: "row", justifyContent: "space-between" },
  macroChip: { alignItems: "center" },
  macroValue: { fontSize: 15, fontWeight: "700", color: colors.text },
  macroLabel: { fontSize: 12, color: colors.muted },
  impact: { fontSize: 13, color: colors.text },
  qtyRow: { flexDirection: "row", gap: 8 },
  qtyChip: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.track,
    alignItems: "center",
    justifyContent: "center",
  },
  why: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  gramsInput: {
    minWidth: 64,
    textAlign: "center",
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  link: { fontSize: 13, fontWeight: "700", color: colors.primaryText },
  quickLink: { alignSelf: "flex-start", paddingBottom: 8, minHeight: 32 },
  quickLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  quickInput: {
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  quickError: { color: colors.danger, marginTop: 10, fontWeight: "600" },
  report: {
    fontSize: 12,
    color: colors.muted,
    textDecorationLine: "underline",
  },
  checked: { fontSize: 12, fontWeight: "700", color: colors.primaryText },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    marginVertical: 12,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.track,
    borderRadius: 8,
  },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.track,
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.track,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 20, fontWeight: "700", color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  section: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 6,
  },
  recentWrap: { marginBottom: 4 },
  recentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  recentChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.track,
    minHeight: 36,
    justifyContent: "center",
  },
  recentChipOn: { backgroundColor: colors.primary },
  recentText: { fontSize: 14, fontWeight: "600", color: colors.text },
  empty: { paddingVertical: 32, alignItems: "center", gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  create: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  createText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  heart: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heartText: { fontSize: 24, color: colors.muted },
});
