const SUPABASE_URL="https://hwfloywzqlgqieonuswl.supabase.co";
const SUPABASE_KEY="sb_publishable_NYoHIme-48fZeXAjF6OZaQ_twFybYI1";

// La sesión HTPWEB debe persistir en toda la experiencia pública y entre pestañas.
// Migramos automáticamente cualquier sesión anterior guardada en sessionStorage.
const HTPWEB_AUTH_STORAGE = {
  getItem(key) {
    let value = window.localStorage.getItem(key);
    if (value !== null) return value;
    value = window.sessionStorage.getItem(key);
    if (value !== null) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    }
    return value;
  },
  setItem(key, value) {
    window.localStorage.setItem(key, value);
    window.sessionStorage.removeItem(key);
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

const supabaseClient=window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      storage: HTPWEB_AUTH_STORAGE,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
