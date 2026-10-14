export const colors = {
  primary: "#2EB583",
  warn: "#F59E0B",
  danger: "#EF4444",
  protein: "#34D399",
  carbs: "#FB923C",
  fat: "#F87171",
  fiber: "#3B82F6",
  bg: "#F8FAFC",
  card: "#FFFFFF",
  track: "#E2E8F0",
  text: "#0F172A",
  muted: "#64748B",
};

export const card = {
  backgroundColor: colors.card,
  borderRadius: 16,
  padding: 16,
  marginHorizontal: 16,
  marginBottom: 12,
  shadowColor: "#000",
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;
