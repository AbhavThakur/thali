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
  getProfile,
  getRecentFoodIds,
  toggleFavourite,
  today,
} from "../src/db/db.ts";
import { allFoods, FOOD_BY_ID } from "../src/domain/foods.ts";
import { formatQty, isAllowed, macrosFor } from "../src/domain/nutrition.ts";
import { SLOTS } from "../src/domain/plan.ts";
import type { DietType, Food, SlotId } from "../src/domain/types.ts";
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
  const [recent, setRecent] = useState<string[]>([]);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    getProfile(db).then((p) => p && setDiet(p.dietType));
    getRecentFoodIds(db).then(setRecent);
  }, [db]);

  // Foods created on the My foods screen show up when coming back here.
  useFocusEffect(
    useCallback(() => {
      getFavouriteIds(db).then(setFavourites);
      setTick((t) => t + 1);
    }, [db]),
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!diet) return [];
    return allFoods().filter(
      (f) => isAllowed(f, diet) && (!q || f.name.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, diet, tick]);

  const pickable = (ids: string[]) =>
    diet
      ? ids
          .map((id) => FOOD_BY_ID[id])
          .filter((f): f is Food => !!f && isAllowed(f, diet))
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
    setQty(1);
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
            accessibilityLabel={`${item.name}, ${Math.round(macrosFor(item, 1).kcal)} kilocalories per ${item.measure.unit}`}
            style={[
              styles.row,
              selected?.id === item.id && { backgroundColor: colors.tint },
            ]}
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.muted}>
              1 {item.measure.unit} · {Math.round(macrosFor(item, 1).kcal)} kcal
            </Text>
          </Pressable>
        )}
      />
      {selected && (
        <View style={styles.footer}>
          <Pressable
            onPress={() => setQty((q) => Math.max(0.5, q - 0.5))}
            style={styles.step}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Less ${selected.name}`}
          >
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.name}>{formatQty(selected, qty)}</Text>
            <Text style={styles.muted}>
              {Math.round(macrosFor(selected, qty).kcal)} kcal
            </Text>
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
            onPress={() => setQty((q) => q + 0.5)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  muted: { fontSize: 13, color: colors.muted },
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
