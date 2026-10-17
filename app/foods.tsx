import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  countFoodLogs,
  deleteCustomFood,
  getCustomFoods,
  getFavouriteIds,
  loadCustomFoods,
  saveCustomFood,
  toggleFavourite,
} from "../src/db/db.ts";
import {
  buildCustomFood,
  EMPTY_CUSTOM_FOOD,
  newCustomFoodId,
  toCustomFoodInput,
  type CustomFoodInput,
} from "../src/domain/customFood.ts";
import { FOOD_BY_ID } from "../src/domain/foods.ts";
import { describeServing, macrosFor } from "../src/domain/nutrition.ts";
import { shareChip, type SubmissionInfo } from "../src/domain/sharedFoods.ts";
import type { Food } from "../src/domain/types.ts";
import { loadSession } from "../src/ui/cloudSync.ts";
import { loadSubmissions, syncCommunity } from "../src/ui/communitySync.ts";
import { haptic } from "../src/ui/haptics.ts";
import { usePeople } from "../src/ui/People.tsx";
import { Sheet, sheetStyles } from "../src/ui/Sheet.tsx";
import { card, colors } from "../src/ui/theme.ts";
import { useToast } from "../src/ui/Toast.tsx";

const TAGS: [
  keyof Pick<CustomFoodInput, "egg" | "meat" | "dairy" | "rootVeg">,
  string,
][] = [
  ["egg", "Has egg"],
  ["meat", "Has meat or fish"],
  ["dairy", "Has milk, curd or ghee"],
  ["rootVeg", "Has onion, garlic or root veg"],
];

function Field({
  label,
  value,
  onChange,
  numeric,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "decimal-pad" : "default"}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function MyFoods() {
  const db = useSQLiteContext();
  const toast = useToast();
  const { people } = usePeople();
  const params = useLocalSearchParams<{ name?: string }>();
  const [foods, setFoods] = useState<Food[]>([]);
  const [subs, setSubs] = useState<Record<string, SubmissionInfo>>({});
  const [favourites, setFavourites] = useState<string[]>([]);
  const [editing, setEditing] = useState<{
    id: string | null;
    form: CustomFoodInput;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Arrived from "Add as your own food": go back to where they were once it's saved.
  const fromAdd = !!params.name;

  const refresh = useCallback(async () => {
    setFoods((await getCustomFoods(db)).filter((f) => !f.quick));
    setFavourites(await getFavouriteIds(db));
    setSubs(loadSubmissions());
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // Pick up review results, then show them.
      void syncCommunity(people).then(() => setSubs(loadSubmissions()));
    }, [refresh, people]),
  );

  useEffect(() => {
    if (params.name)
      setEditing({
        id: null,
        form: { ...EMPTY_CUSTOM_FOOD, name: params.name },
      });
  }, [params.name]);

  const set =
    <K extends keyof CustomFoodInput>(k: K) =>
    (v: CustomFoodInput[K]) =>
      setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  const save = async () => {
    if (!editing) return;
    const id = editing.id ?? newCustomFoodId(foods.map((f) => f.id));
    const built = buildCustomFood(editing.form, id);
    if ("error" in built) {
      haptic.warn();
      return setError(built.error);
    }
    await saveCustomFood(db, built.food);
    await loadCustomFoods(db);
    await refresh();
    void syncCommunity(people, true).then(() => setSubs(loadSubmissions()));
    haptic.success();
    setEditing(null);
    setError(null);
    toast(`${built.food.name} saved`);
    if (fromAdd) router.back();
  };

  const remove = async (f: Food) => {
    const used = await countFoodLogs(db, f.id);
    if (used > 0)
      return Alert.alert(
        "Can't delete this food",
        `It is in ${used} of your logged meals, and deleting it would change those days. You can edit its values instead.`,
      );
    Alert.alert(`Delete ${f.name}?`, "This can't be undone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteCustomFood(db, f.id);
          await loadCustomFoods(db);
          await refresh();
        },
      },
    ]);
  };

  const favFoods = favourites
    .map((id) => FOOD_BY_ID[id])
    .filter((f): f is Food => !!f);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={card}>
        <Text style={styles.title}>Your own foods</Text>
        <Text style={styles.muted}>
          Add dishes that aren't in Thali, like your family's recipes or a
          packaged snack. They appear in search and in meal edits.
        </Text>
        <Text style={[styles.muted, { marginTop: 6 }]}>
          Foods you add are also sent, without your name, to Thali's shared list
          once they have been checked, so everyone gets correct numbers. If
          something is wrong, it is fixed for you too.
        </Text>
        {foods.length === 0 ? (
          <Text style={[styles.muted, { marginTop: 12 }]}>
            Nothing here yet.
          </Text>
        ) : (
          foods.map((f) => {
            const info = subs[f.id];
            const chip = shareChip(info, !!loadSession());
            const locked = info?.status === "approved";
            return (
              <View key={f.id} style={styles.row}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() =>
                    locked
                      ? Alert.alert(
                          "Checked and shared",
                          "This food is now in Thali's shared list, so its numbers can't be changed here. If something looks wrong, open the food when adding it and tap Report.",
                        )
                      : f.recipe
                        ? router.push({ pathname: "/recipe", params: { id: f.id } })
                        : setEditing({ id: f.id, form: toCustomFoodInput(f) })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${locked ? "View" : "Edit"} ${f.name}`}
                >
                  <Text style={styles.name}>{f.name}</Text>
                  <Text style={styles.muted}>
                    {describeServing(f, 1)} · {Math.round(macrosFor(f, 1).kcal)}{" "}
                    kcal · {Math.round(macrosFor(f, 1).protein)} g protein
                  </Text>
                  <Text
                    style={[
                      styles.status,
                      chip.tone === "good" && { color: colors.primaryText },
                      chip.tone === "wait" && { color: colors.warnText },
                    ]}
                  >
                    {chip.text}
                    {info?.status === "rejected" && info.note
                      ? ` · ${info.note}`
                      : ""}
                  </Text>
                </Pressable>
                <Pressable
                  hitSlop={10}
                  onPress={() => remove(f)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${f.name}`}
                >
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>
              </View>
            );
          })
        )}
        <Pressable
          style={styles.add}
          onPress={() => setEditing({ id: null, form: EMPTY_CUSTOM_FOOD })}
          accessibilityRole="button"
        >
          <Text style={styles.addText}>+ Add a food</Text>
        </Pressable>
        <Pressable
          style={styles.addAlt}
          onPress={() => router.push("/recipe")}
          accessibilityRole="button"
        >
          <Text style={styles.addAltText}>🍲 Make a recipe from ingredients</Text>
        </Pressable>
      </View>

      <View style={card}>
        <Text style={styles.title}>Favourites</Text>
        <Text style={styles.muted}>
          Tap the heart when adding a food to keep it handy.
        </Text>
        {favFoods.length === 0 ? (
          <Text style={[styles.muted, { marginTop: 12 }]}>
            No favourites yet.
          </Text>
        ) : (
          favFoods.map((f) => (
            <View key={f.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{f.name}</Text>
                <Text style={styles.muted}>
                  1 {f.measure.unit} · {Math.round(macrosFor(f, 1).kcal)} kcal
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                onPress={async () => {
                  await toggleFavourite(db, f.id);
                  setFavourites(await getFavouriteIds(db));
                }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${f.name} from favourites`}
              >
                <Text style={styles.heart}>♥</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => {
          setEditing(null);
          setError(null);
        }}
      >
        <ScrollView
          style={{ maxHeight: 520 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={sheetStyles.title}>
            {editing?.id ? "Edit food" : "Add a food"}
          </Text>
          <Text style={sheetStyles.sub}>
            Enter the numbers for one serving. Packs list them as “per serving”.
          </Text>
          {editing && (
            <>
              <View style={styles.formRow}>
                <Field
                  label="Name"
                  value={editing.form.name}
                  onChange={set("name")}
                  placeholder="Besan laddoo"
                />
              </View>
              <View style={styles.formRow}>
                <Field
                  label="Serving is one…"
                  value={editing.form.unit}
                  onChange={set("unit")}
                  placeholder="laddoo, katori"
                />
                <Field
                  label="Serving weight (g)"
                  value={editing.form.grams}
                  onChange={set("grams")}
                  numeric
                />
              </View>
              <View style={styles.formRow}>
                <Field
                  label="Calories"
                  value={editing.form.kcal}
                  onChange={set("kcal")}
                  numeric
                />
                <Field
                  label="Protein (g)"
                  value={editing.form.protein}
                  onChange={set("protein")}
                  numeric
                />
              </View>
              <View style={styles.formRow}>
                <Field
                  label="Carbs (g)"
                  value={editing.form.carbs}
                  onChange={set("carbs")}
                  numeric
                />
                <Field
                  label="Fat (g)"
                  value={editing.form.fat}
                  onChange={set("fat")}
                  numeric
                />
                <Field
                  label="Fiber (g)"
                  value={editing.form.fiber}
                  onChange={set("fiber")}
                  numeric
                />
              </View>
              <Text style={styles.label}>
                So Thali can hide it from diets it doesn't suit
              </Text>
              <View style={styles.chips}>
                {TAGS.map(([key, label]) => (
                  <Pressable
                    key={key}
                    onPress={() => set(key)(!editing.form[key])}
                    style={[styles.chip, editing.form[key] && styles.chipOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: editing.form[key] }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        editing.form[key] && { color: "#fff" },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {editing.id ? (
                <Text style={[styles.muted, { marginTop: 10 }]}>
                  Changing these numbers also updates days you already logged
                  with this food.
                </Text>
              ) : null}
              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
        <Pressable
          style={sheetStyles.save}
          onPress={save}
          accessibilityRole="button"
        >
          <Text style={sheetStyles.saveText}>Save food</Text>
        </Pressable>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 17, fontWeight: "800", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  status: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 2,
  },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
    marginTop: 4,
  },
  delete: { fontSize: 13, fontWeight: "700", color: colors.danger },
  heart: { fontSize: 24, color: colors.danger },
  add: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: "center",
  },
  addText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  addAlt: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 22,
    paddingVertical: 11,
    alignItems: "center",
  },
  addAltText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.track,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  error: { color: colors.danger, marginTop: 12, fontWeight: "600" },
});
