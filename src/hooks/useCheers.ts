import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { subscribeCheers, unseenCheers } from "../ui/familySync.ts";

/** How many family cheers are waiting to be read; refreshes on start, on return to the app and every few minutes. */
export function useCheers(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () => {
      unseenCheers();
    };
    refresh();
    const timer = setInterval(refresh, 5 * 60 * 1000);
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    const off = subscribeCheers(setCount);
    return () => {
      clearInterval(timer);
      app.remove();
      off();
    };
  }, []);
  return count;
}
