// ═══════════════════════════════════════════════════════════════
// Célula Ágape — Configuração do Supabase
// Substitua os valores abaixo com os dados do seu projeto Supabase
// ═══════════════════════════════════════════════════════════════

// 1. Acesse https://app.supabase.com
// 2. Selecione seu projeto
// 3. Vá em Settings > API
// 4. Copie a "Project URL" e a "anon public" key

const SUPABASE_URL = 'COLE_SUA_URL_AQUI';        // ex: https://xyzxyz.supabase.co
const SUPABASE_ANON_KEY = 'COLE_SUA_ANON_KEY_AQUI'; // começa com "eyJ..."

// VAPID Public Key para Web Push Notifications
// Gere em: https://web-push-codelab.glitch.me/
// ou via: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = 'COLE_SUA_VAPID_PUBLIC_KEY_AQUI';
