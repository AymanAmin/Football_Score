/*
 * Public browser configuration for optional Supabase sync.
 * The publishable/anon key is safe to expose only when RLS is enabled.
 * Never place a service_role key or any secret key in this file.
 */
window.FOOTBALL_CLOUD_CONFIG = Object.freeze({
  supabaseUrl: "",
  supabaseAnonKey: ""
});
