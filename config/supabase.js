const SUPABASE_URL="https://hwfloywzqlgqieonuswl.supabase.co";
const SUPABASE_KEY="sb_publishable_NYoHIme-48fZeXAjF6OZaQ_twFybYI1";

// La sesión de autenticación vive por pestaña. Esto permite probar/usar
// MASTER, DELIVERY y CLIENTE simultáneamente sin que una pestaña reemplace
// la sesión de las demás. El carrito ya utiliza sessionStorage también.
const HTPWEB_AUTH_STORAGE = {
  getItem(key) {
    return window.sessionStorage.getItem(key);
  },
  setItem(key, value) {
    window.sessionStorage.setItem(key, value);
  },
  removeItem(key) {
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
