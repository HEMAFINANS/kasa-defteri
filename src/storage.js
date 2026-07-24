export const storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { key, value: raw } : null;
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      throw e;
    }
  },
};
