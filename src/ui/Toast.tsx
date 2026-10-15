import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme.ts";

type Toast = {
  id: number;
  message: string;
  action?: { label: string; onPress: () => void };
};
type Show = (message: string, action?: Toast["action"]) => void;

const ToastContext = createContext<Show>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback<Show>((message, action) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, action });
    timer.current = setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
      5000,
    );
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.springify().damping(18)}
          exiting={FadeOutDown}
          style={[styles.toast, { bottom: insets.bottom + 70 }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.text}>{toast.message}</Text>
          {toast.action && (
            <Pressable
              hitSlop={10}
              onPress={() => {
                toast.action?.onPress();
                setToast(null);
              }}
            >
              <Text style={styles.action}>{toast.action.label}</Text>
            </Pressable>
          )}
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.text,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: "#fff", fontSize: 14, fontWeight: "600", flex: 1 },
  action: { color: "#6EE7B7", fontSize: 14, fontWeight: "800" },
});
