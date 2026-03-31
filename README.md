# Célula Ágape App

Um Progressive Web App (PWA) criado para gerenciar a Célula Ágape (Igreja Videira), com mural de mensagens, escala de lanches e notificações.

## 🚀 Novidades nesta versão
- **Ícones Corrigidos**: Os ícones do app foram redimensionados para aparecerem completos (sem cortar a palavra "Ágape").
- **Bug da Escala Resolvido**: A seleção de membros na escala de lanche agora funciona corretamente.
- **Integração com Supabase**: O app agora tem suporte completo a banco de dados em tempo real.
- **Loading State**: Tela de carregamento enquanto conecta ao banco.

## ⚙️ Configuração do Supabase (Banco de Dados)

Para que os dados sejam salvos permanentemente e sincronizados entre todos os membros, você precisa configurar o Supabase:

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e crie um novo projeto.
2. Vá em **SQL Editor** no painel do Supabase.
3. Copie o conteúdo do arquivo `supabase_schema.sql` (que está neste repositório) e cole no SQL Editor, depois clique em **Run**. Isso criará todas as tabelas necessárias.
4. Vá em **Project Settings > API**.
5. Copie a **Project URL** e a **Project API Key (anon public)**.
6. Abra o arquivo `index.html` do seu projeto e substitua as variáveis na linha ~750:
   ```javascript
   const SUPABASE_URL = 'COLE_SUA_URL_AQUI';
   const SUPABASE_ANON_KEY = 'COLE_SUA_ANON_KEY_AQUI';
   ```

## 🌐 Deploy no Vercel

O projeto já contém o arquivo `vercel.json` configurado corretamente para PWA.

1. Crie uma conta no [Vercel](https://vercel.com) conectada ao seu GitHub.
2. Clique em **Add New > Project**.
3. Selecione o repositório `celula-agape-app`.
4. Não é necessário mudar nenhuma configuração de build, pois é um site estático.
5. Clique em **Deploy**.

## 👤 Usuário Padrão
Após configurar o banco de dados, um usuário administrador é criado automaticamente:
- **Login:** admin
- **Senha:** agape2024

## 🔔 Notificações Push
O sistema atual usa o Service Worker para agendar notificações localmente no dispositivo do usuário. Para funcionar perfeitamente:
1. O usuário precisa acessar o site e clicar em **Instalar App** (adicionar à tela inicial).
2. Na aba Escala, clicar em **Ativar Notificações**.
3. Ao adicionar uma escala com alarme, o app agendará as notificações no dispositivo de quem criou.
