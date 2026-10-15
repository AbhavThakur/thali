import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CloudError,
  formatRecoveryCode,
  hasNoEmail,
  isCode,
  isEmail,
  isRecoveryCode,
  type CloudSession,
} from "../src/domain/cloud.ts";
import {
  autoBackupOn,
  backupAll,
  cloudConfig,
  getCloud,
  lastBackupAt,
  loadSession,
  newRecoveryCode,
  restoreAll,
  savedRecoveryCode,
  saveSession,
  setAutoBackup,
  signInWithRecoveryCode,
  signOut,
  startWithoutEmail,
} from "../src/ui/cloudSync.ts";
import { haptic } from "../src/ui/haptics.ts";
import { usePeople } from "../src/ui/People.tsx";
import { card, colors } from "../src/ui/theme.ts";
import { useToast } from "../src/ui/Toast.tsx";

const message = (e: unknown) =>
  e instanceof CloudError
    ? e.message
    : "Something went wrong. Please try again.";

export default function Cloud() {
  const { people, replaceAll } = usePeople();
  const toast = useToast();
  const [session, setSession] = useState<CloudSession | null>(loadSession);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(autoBackupOn);
  const [last, setLast] = useState(lastBackupAt);
  const [recovery, setRecovery] = useState(savedRecoveryCode);
  const [typedCode, setTypedCode] = useState("");

  // Runs a cloud action with one busy flag and one place for errors.
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      haptic.warn();
      setError(message(e));
      if (e instanceof CloudError && e.status === 401)
        setSession(loadSession());
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await getCloud().sendCode(email);
      setCodeSent(true);
    });

  const verify = () =>
    run(async () => {
      const s = await getCloud().verifyCode(email, code);
      saveSession(s);
      setSession(s);
      setCode("");
      setCodeSent(false);
      haptic.success();
    });

  const startNoEmail = () =>
    run(async () => {
      const c = await startWithoutEmail();
      setRecovery(c);
      setSession(loadSession());
      haptic.success();
    });

  const remakeCode = () =>
    Alert.alert(
      "Make a new recovery code?",
      "The old code stops working. Save the new one.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make new code",
          onPress: () =>
            run(async () => {
              setRecovery(await newRecoveryCode());
              haptic.success();
            }),
        },
      ],
    );

  const restoreWithCode = () =>
    Alert.alert(
      "Restore with this code?",
      "This replaces the data on this phone with the backup that belongs to the code.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: () =>
            run(async () => {
              const moved = await signInWithRecoveryCode(typedCode);
              setSession(loadSession());
              setRecovery(savedRecoveryCode());
              if (!moved) {
                toast("That code has no backup yet");
                return;
              }
              const r = await restoreAll(people);
              replaceAll(r.people);
              haptic.success();
              toast(`Restored ${r.restored}`);
              router.replace("/");
            }),
        },
      ],
    );

  const backup = () =>
    run(async () => {
      const n = await backupAll(people);
      setLast(lastBackupAt());
      haptic.success();
      toast(n === 1 ? "Backed up" : `Backed up ${n} people`);
    });

  const restore = () =>
    Alert.alert(
      "Restore from the cloud?",
      "This replaces the data on this phone for everyone who has a cloud backup. Anything newer on this phone is lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: () =>
            run(async () => {
              const r = await restoreAll(people);
              if (!r.restored) {
                toast("No backup found in the cloud yet");
                return;
              }
              replaceAll(r.people);
              haptic.success();
              toast(`Restored ${r.restored}`);
              router.replace("/");
            }),
        },
      ],
    );

  if (!cloudConfig())
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingVertical: 16 }}
      >
        <View style={card}>
          <Text style={styles.title}>Cloud backup isn't set up</Text>
          <Text style={styles.body}>
            Cloud backup needs a free Supabase project. Create one, run the SQL
            in supabase/schema.sql, then copy .env.example to .env and fill in
            your project URL and anon key. Restart the app with
            {" npx expo start -c"} and rebuild your APK. The steps are in
            README.md.
          </Text>
          <Text style={[styles.body, { marginTop: 10 }]}>
            Until then, use Me → Export backup to keep a copy of your data.
          </Text>
        </View>
      </ScrollView>
    );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {!session ? (
        <>
        <View style={card}>
          <Text style={styles.title}>Sign in with email</Text>
          <Text style={styles.body}>
            We email you a code, so there is no password to remember. Your
            backup is private to your account.
          </Text>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!codeSent}
            accessibilityLabel="Email"
          />
          {codeSent ? (
            <>
              <Text style={styles.label}>Code from the email</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={10}
                accessibilityLabel="Code from the email"
              />
            </>
          ) : null}
          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Pressable
            style={[
              styles.primary,
              (busy || (codeSent ? !isCode(code) : !isEmail(email))) && {
                opacity: 0.5,
              },
            ]}
            disabled={busy || (codeSent ? !isCode(code) : !isEmail(email))}
            onPress={codeSent ? verify : sendCode}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>
                {codeSent ? "Sign in" : "Email me a code"}
              </Text>
            )}
          </Pressable>
          {codeSent ? (
            <Pressable
              onPress={() => {
                setCodeSent(false);
                setCode("");
                setError(null);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Use a different email</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={card}>
          <Text style={styles.title}>No email? Use a recovery code</Text>
          <Text style={styles.body}>
            Thali makes a private account for this phone and a random recovery
            code. Save the code: it is the only way to get your backup back on a
            new phone.
          </Text>
          <Pressable
            style={[styles.secondary, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={startNoEmail}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Start without email</Text>
          </Pressable>
          <Text style={styles.label}>Already have a code? Enter it</Text>
          <TextInput
            style={styles.input}
            value={typedCode}
            onChangeText={setTypedCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Recovery code"
          />
          <Pressable
            style={[
              styles.secondary,
              (busy || !isRecoveryCode(typedCode)) && { opacity: 0.5 },
            ]}
            disabled={busy || !isRecoveryCode(typedCode)}
            onPress={restoreWithCode}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Restore with this code</Text>
          </Pressable>
        </View>
        </>
      ) : (
        <>
          <View style={card}>
            <Text style={styles.title}>
              {hasNoEmail(session) ? "Signed in without email" : "Signed in"}
            </Text>
            {hasNoEmail(session) ? null : (
              <Text style={styles.body}>{session.email}</Text>
            )}
            <Text style={[styles.muted, { marginTop: 4 }]}>
              {last
                ? `Last backup ${new Date(last).toLocaleString()}`
                : "No backup from this phone yet"}
            </Text>
            {error ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
            <Pressable
              style={[styles.primary, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={backup}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>
                  Back up{people.list.length > 1 ? " everyone" : ""} now
                </Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.secondary, busy && { opacity: 0.5 }]}
              disabled={busy}
              onPress={restore}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Restore from the cloud</Text>
            </Pressable>
          </View>

          {hasNoEmail(session) && (
            <View style={card}>
              <Text style={styles.title}>Your recovery code</Text>
              <Text style={styles.body}>
                Save this somewhere safe, like a password manager or a note to
                yourself. Without it, a lost or reset phone means a lost backup.
              </Text>
              <Text selectable style={styles.code} accessibilityLabel="Recovery code">
                {recovery ? formatRecoveryCode(recovery) : "Not saved on this phone"}
              </Text>
              {recovery ? (
                <Pressable
                  style={styles.secondary}
                  onPress={() =>
                    Share.share({
                      message: `My Thali recovery code: ${formatRecoveryCode(recovery)}`,
                    })
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryText}>Save or share the code</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={remakeCode} accessibilityRole="button">
                <Text style={styles.link}>Make a new code</Text>
              </Pressable>
            </View>
          )}

          <View style={[card, styles.autoRow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Back up automatically</Text>
              <Text style={styles.muted}>
                About once a day, when you open the app.
              </Text>
            </View>
            <Switch
              value={auto}
              onValueChange={(v) => {
                setAutoBackup(v);
                setAuto(v);
              }}
              trackColor={{ true: colors.primary }}
              accessibilityLabel="Back up automatically"
            />
          </View>

          <Pressable
            style={styles.signOut}
            onPress={() => {
              const out = () => {
                signOut();
                setSession(null);
                setAuto(false);
                setError(null);
              };
              if (!hasNoEmail(session)) return out();
              Alert.alert(
                "Sign out?",
                "Without email you can only sign back in with your recovery code. Make sure you saved it.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign out", style: "destructive", onPress: out },
                ],
              );
            }}
            accessibilityRole="button"
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </>
      )}

      <View style={card}>
        <Text style={styles.title}>What is stored</Text>
        <Text style={styles.muted}>
          Your profile, food logs, weights, custom foods and settings, saved in
          your own Supabase project. Nothing is shared, and only you can read
          your backup. Switching phones? Sign in the same way on the new phone
          (email code, or your recovery code) and tap Restore.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 17, fontWeight: "800", color: colors.text },
  body: { fontSize: 14, lineHeight: 21, color: colors.text, marginTop: 6 },
  muted: { fontSize: 13, color: colors.muted },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger, marginTop: 12, fontWeight: "600" },
  code: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    textAlign: "center",
  },
  primary: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondary: {
    marginTop: 10,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.track,
  },
  secondaryText: { color: colors.text, fontWeight: "700", fontSize: 15 },
  link: {
    color: colors.primaryText,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 14,
  },
  autoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  signOut: { alignItems: "center", paddingVertical: 12 },
  signOutText: { color: colors.danger, fontWeight: "700" },
});
