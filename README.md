# Célula Ágape — PWA

## Como fazer deploy no Vercel

1. Crie uma conta em vercel.com
2. Instale o Vercel CLI: `npm i -g vercel`
3. Na pasta do projeto, rode: `vercel`
4. Siga as instruções — em 2 minutos o app estará online

## Estrutura
```
agape-pwa/
├── index.html      ← App completo
├── sw.js           ← Service Worker (notificações + cache offline)
├── manifest.json   ← Configuração PWA (ícone, nome, cores)
├── vercel.json     ← Configuração de deploy
└── icons/
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-144.png
    ├── icon-152.png
    ├── icon-192.png
    ├── icon-384.png
    └── icon-512.png
```

## Credenciais padrão
- Login: admin
- Senha: agape2024

## Notificações
As notificações funcionam quando o app está instalado na tela inicial.
No iOS: Safari → Compartilhar → Adicionar à Tela de Início
No Android: Chrome → Menu → Instalar app (ou banner automático)
