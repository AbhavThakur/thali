import { Alert, Platform } from "react-native";

// React Native's Alert does nothing in a browser, so confirm and error prompts would silently vanish on web.
if (Platform.OS === "web") {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join("\n\n");
    const cancel = buttons?.find((b) => b.style === "cancel");
    const action = buttons?.find((b) => b !== cancel);
    if (!action) {
      window.alert(text);
      cancel?.onPress?.();
    } else if (window.confirm(text)) action.onPress?.();
    else cancel?.onPress?.();
  };
}
