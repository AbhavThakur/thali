import { deleteDatabaseAsync } from "expo-sqlite";
import Storage from "./kv";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  activePerson,
  addPerson,
  MAX_PEOPLE,
  parsePeople,
  removePerson,
  renamePerson,
  switchPerson,
  type People,
  type Person,
} from "../domain/people.ts";
import { haptic } from "./haptics.ts";
import { PromptSheet, Sheet, sheetStyles } from "./Sheet.tsx";
import { colors } from "./theme.ts";

const KEY = "people";

type Ctx = {
  people: People;
  person: Person;
  /** Bumps after data changed behind the app's back (a cloud restore), so screens reopen the database. */
  epoch: number;
  switchTo: (id: string) => void;
  add: (name: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => Promise<void>;
  replaceAll: (people: People) => void;
};

const PeopleContext = createContext<Ctx | null>(null);

export function usePeople(): Ctx {
  const c = useContext(PeopleContext);
  if (!c) throw new Error("usePeople needs a PeopleProvider");
  return c;
}

/** Everyone who uses Thali on this phone. The active person's database is the one the app opens. */
export function PeopleProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<People>(() =>
    parsePeople(Storage.getItemSync(KEY)),
  );
  const [epoch, setEpoch] = useState(0);
  const update = useCallback((next: People) => {
    Storage.setItemSync(KEY, JSON.stringify(next));
    setPeople(next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      people,
      person: activePerson(people),
      epoch,
      replaceAll: (next) => {
        update(next);
        setEpoch((e) => e + 1);
      },
      switchTo: (id) => update(switchPerson(people, id)),
      add: (name) => update(addPerson(people, name)),
      rename: (id, name) => {
        const next = renamePerson(people, id, name);
        if (next !== people) update(next);
      },
      remove: async (id) => {
        const gone = people.list.find((p) => p.id === id);
        update(removePerson(people, id));
        if (!gone) return;
        // An open database can't be deleted: if they were active, wait for the provider to close it.
        if (gone.id === people.active)
          await new Promise((r) => setTimeout(r, 1200));
        await deleteDatabaseAsync(gone.dbName).catch(() => {});
      },
    }),
    [people, epoch, update],
  );
  return (
    <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>
  );
}

/** Lists everyone, switches between them and adds or removes people. */
export function PeopleSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { people, person, switchTo, add, remove } = usePeople();
  const [adding, setAdding] = useState(false);

  const confirmRemove = (p: Person) =>
    Alert.alert(
      `Remove ${p.name}?`,
      "Their plan, food log and weight history are deleted from this phone. This can't be undone.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            haptic.warn();
            void remove(p.id);
          },
        },
      ],
    );

  return (
    <>
      <Sheet visible={visible && !adding} onClose={onClose}>
        <Text style={sheetStyles.title}>Who is using Thali?</Text>
        <Text style={sheetStyles.sub}>
          Everyone has their own goals, plan and progress.
        </Text>
        <View style={{ marginTop: 12 }}>
          {people.list.map((p) => {
            const active = p.id === person.id;
            return (
              <View key={p.id} style={styles.row}>
                <Pressable
                  style={styles.who}
                  accessibilityRole="button"
                  accessibilityLabel={
                    active ? `${p.name}, current person` : `Switch to ${p.name}`
                  }
                  onPress={() => {
                    if (active) return onClose();
                    haptic.tap();
                    switchTo(p.id);
                    onClose();
                  }}
                >
                  <View style={[styles.avatar, active && styles.avatarOn]}>
                    <Text style={[styles.initial, active && { color: "#fff" }]}>
                      {p.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.name}>{p.name}</Text>
                  {active ? <Text style={styles.tag}>Current</Text> : null}
                </Pressable>
                {!active && (
                  <Pressable
                    hitSlop={10}
                    onPress={() => confirmRemove(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${p.name}`}
                  >
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
        {people.list.length < MAX_PEOPLE ? (
          <Pressable
            style={sheetStyles.save}
            accessibilityRole="button"
            onPress={() => setAdding(true)}
          >
            <Text style={sheetStyles.saveText}>Add a person</Text>
          </Pressable>
        ) : null}
      </Sheet>
      <PromptSheet
        visible={visible && adding}
        title="Who are you adding?"
        subtitle="They'll set up their own goal next."
        initial=""
        validate={(v) => (v.trim() ? null : "Enter a name.")}
        onClose={() => setAdding(false)}
        onSave={(name) => {
          setAdding(false);
          onClose();
          add(name);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  who: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.track,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOn: { backgroundColor: colors.primary },
  initial: { fontSize: 18, fontWeight: "800", color: colors.text },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  tag: { fontSize: 12, fontWeight: "700", color: colors.primaryText },
  remove: { fontSize: 13, fontWeight: "700", color: colors.danger },
});
