// expo-sqlite's sync kv-store times out on web while its worker loads, so use localStorage there.
const Storage = {
  getItemSync: (key: string) => localStorage.getItem(key),
  setItemSync: (key: string, value: string) => localStorage.setItem(key, value),
  removeItemSync: (key: string) => localStorage.removeItem(key),
};

export default Storage;
