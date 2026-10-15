import { useEffect, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { haptic } from "./haptics.ts";
import { colors } from "./theme.ts";

export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One-field sheet; `validate` returns an error message or null. */
export function PromptSheet({
  visible,
  title,
  subtitle,
  initial,
  numeric,
  unit,
  validate,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  initial: string;
  numeric?: boolean;
  unit?: string;
  validate: (v: string) => string | null;
  onClose: () => void;
  onSave: (v: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setValue(initial);
      setError(null);
    }
  }, [visible, initial]);

  const save = async () => {
    const e = validate(value);
    if (e) {
      haptic.warn();
      return setError(e);
    }
    await onSave(value.trim());
    haptic.success();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      <View style={[styles.inputWrap, error && { borderColor: colors.danger }]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setError(null);
          }}
          keyboardType={numeric ? "decimal-pad" : "default"}
          autoFocus
          onSubmitEditing={save}
          returnKeyType="done"
          accessibilityLabel={title}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.save} onPress={save} accessibilityRole="button">
        <Text style={styles.saveText}>Save</Text>
      </Pressable>
    </Sheet>
  );
}

export const sheetStyles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 4 },
  save: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});

const styles = StyleSheet.create({
  ...sheetStyles,
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  grab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
    marginBottom: 12,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.track,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  input: { flex: 1, fontSize: 20, paddingVertical: 12, color: colors.text },
  unit: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  error: { color: colors.danger, marginTop: 8, fontWeight: "600" },
});
