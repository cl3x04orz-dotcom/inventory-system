export const safeLocalStorage = (function() {
  try {
    const storage = window.localStorage;
    const x = '__storage_test__';
    storage.setItem(x, x);
    storage.removeItem(x);
    return storage;
  } catch (e) {
    let store = {};
    return {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { store = {}; },
      key: (index) => Object.keys(store)[index] || null,
      get length() { return Object.keys(store).length; }
    };
  }
})();

export const safeSessionStorage = (function() {
  try {
    const storage = window.sessionStorage;
    const x = '__storage_test__';
    storage.setItem(x, x);
    storage.removeItem(x);
    return storage;
  } catch (e) {
    let store = {};
    return {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { store = {}; },
      key: (index) => Object.keys(store)[index] || null,
      get length() { return Object.keys(store).length; }
    };
  }
})();
