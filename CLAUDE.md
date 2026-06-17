# Plataforma BRLN — Guia para Claude Code

Plataforma de stablecoin BRLN (1:1 com o Real Brasileiro) com backoffice admin, dashboard do usuário, API BFF e integração DFNS para operações on-chain.

---

## Projetos — Como o usuário se refere e onde ficam

| O usuário diz | Projeto | Diretório local | Repo GitHub |
|---|---|---|---|
| "backoffice", "controller" | cripto-controller | `/Users/abraz/projetos/cripto-controller` | `alexjavabraz/cripto-controller` |
| "dashboard" | cripto-dashboard | `/Users/abraz/projetos/cripto-dashboard` | `financial-bjbraz/cripto-dashboard` |
| "bff" | cripto-bff | `/Users/abraz/projetos/bff` | `alexjavabraz/cripto-bff` |
| "dfns", "dfns_integration" | dfns_integration | `/Users/abraz/projetos/dfns_integration` | `alexjavabraz/cripto-dfns-integration` |
| "testes", "e2e" | cripto-tests | `/Users/abraz/projetos/cripto-tests` | `alexjavabraz/cripto-tests` |

**Quando o usuário diz "publicar"**: fazer `git add src/ && git commit && git push origin main` no projeto mencionado. Nunca commitar `dist/`.

---

## Deploy de cada projeto

### Backoffice (cripto-controller)
- **Stack**: Angular 19 standalone + Bootstrap 4 (Clean Admin theme)
- **Deploy**: `git push origin main` → GitHub Actions → `ng build` → S3 → CloudFront invalida cache
- **URL prod**: https://backoffice.tokeniza.net
- **URL local**: https://localhost (Docker + mkcert) ou `ng serve`
- **Secrets CI**: `BFF_URL_PROD`, `REDIRECT_URI_PROD`, `ETHEREUM_SEPOLIA_RPC`

### Dashboard (cripto-dashboard)
- **Stack**: Angular (módulos) + dark theme customizado
- **Deploy**: `git push origin main` → GitHub Actions → `ng build` → S3 → CloudFront invalida cache
- **URL prod**: https://tokeniza.net
- **Secrets CI**: `BFF_URL_PROD`, `REDIRECT_URI_PROD`, `ETHEREUM_SEPOLIA_RPC`

### BFF (cripto-bff)
- **Stack**: Node.js + Express + TypeScript + MongoDB (DocumentDB) + Redis + RabbitMQ (AmazonMQ)
- **Deploy**: `git push origin main` → GitHub Actions → Docker build → ECR push → EC2 pull & restart
- **URL prod**: https://bff.tokeniza.net (ALB → EC2:3000)
- **Porta local**: 3443 (HTTPS com cert local) ou 3000 (HTTP)
- **Secrets CI**: `EC2_HOST`, `EC2_SSH_KEY`, `AWS_ACCOUNT_ID_PROD`, `ETHEREUM_SEPOLIA_RPC`

### dfns_integration
- **Stack**: Node.js + TypeScript + ethers.js v6 + DFNS SDK
- **Deploy**: `git push origin main` → GitHub Actions → Docker build → ECR push → EC2 pull & restart
- **Sem porta pública** — comunica apenas via RabbitMQ com o BFF
- **Secrets CI**: `EC2_HOST`, `EC2_SSH_KEY`, `AWS_ACCOUNT_ID_PROD`, `ETHEREUM_SEPOLIA_RPC`

---

## Padrões de Design

### Angular — Backoffice (standalone)
- Componentes standalone com `imports[]` explícito (pipes como `SlicePipe`, `AsyncPipe` devem ser importados)
- Controle de fluxo: `@if / @for / @switch / @empty` (Angular 17+)
- Signals para estado reativo: `signal()`, `computed()`, `effect()`
- Guards funcionais: `CanActivateFn`; interceptors funcionais: `HttpInterceptorFn`
- Tema: Clean Admin Bootstrap 4 — classes `.element-wrapper > .element-box`, `.table.table-lightborder`, `.badge-*`
- `input[type="number"]` + `[(ngModel)]` → usar `type="text" inputmode="decimal"` para evitar crash silencioso no `.trim()`

### Angular — Dashboard (módulos)
- Módulos lazy-loaded com `loadChildren`
- Componentes públicos (sem AuthGuard) declarados em módulo próprio com `RouterModule.forChild`
- Dark theme customizado: classes `.auth-wrapper`, `.auth-box`, `.form-control`, `.auth-submit`
- Formulários de conversão (buy/sell): apenas inteiros (`parseInt(digits, 10)` sem divisão), `formatInt` com `toLocaleString('pt-BR', { maximumFractionDigits: 0 })`

### BFF (Express)
- Rotas agrupadas: `/auth`, `/admin`, `/user`, `/public` (sem auth), `/cripto`, `/token`, `/wallets`
- Middleware de auth antes de todas as rotas exceto `/public` e `/auth`
- Rate limit separado: `authLimiter` só em `POST /auth/login`; `registerLimiter` só em `POST /public/register-request` (5 req/h/IP)
- `app.set('trust proxy', 1)` obrigatório para rate limiter funcionar atrás do ALB
- Stores MongoDB: um arquivo por entidade (`*-store.ts`) com funções puras (sem classe)
- Nunca nack em falha de negócio nos consumers RabbitMQ — sempre ack + publica response de erro

### WebSocket
- BFF emite eventos via `emitToUser(userId, event, payload)` e `emitToAll(event, payload)`
- Dashboard escuta via `BalanceSocketService` — eventos relevantes: `token:balance:updated`, `user:transfer:updated`, `conversion:approved`, `conversion:completed`, `conversion:rejected`
- Backoffice escuta via `WsService` — eventos: `admin:balance:updated`, `admin:conversion:updated`, `registration:approved`

---

## Segurança — OWASP Top 10

### A01 — Broken Access Control
- Rotas `/admin/*` exigem grupo Cognito `administrador` (validado no BFF)
- Rotas `/user/*` exigem token válido; usuário só acessa seus próprios dados
- Rota `/public/register-request` é pública mas apenas cria pedidos; aprovação é exclusiva do admin
- Tokens: nunca `localStorage`; usar apenas `sessionStorage`

### A02 — Cryptographic Failures
- TLS terminado no ALB (certificado ACM `*.tokeniza.net`)
- Senhas nunca trafegam: auth via Cognito OIDC (PKCE)
- `withCredentials: true` em todas as requisições BFF

### A03 — Injection
- Formulários Angular: rejeitar inputs com `<tags HTML>`, `javascript:`, event handlers (`on\w+=`), SQL keywords (`DROP/SELECT/INSERT`), path traversal (`../`), HTML entities (`&#x...`)
- BFF: validação com Zod em todos os endpoints; endereços EVM validados com regex `/^0x[0-9a-fA-F]{40}$/`
- MongoDB: usar funções de store com parâmetros tipados — nunca concatenar strings em queries

### A04 — Insecure Design
- Valores monetários: apenas inteiros (sem decimais) nas conversões BRLN
- CPF: validado com algoritmo de dígitos verificadores; sequências iguais (`000...`) rejeitadas
- Idade mínima 18 anos validada no formulário de registro
- Saldo validado antes de criar pedido de conversão (sem pedido se saldo insuficiente)

### A05 — Security Misconfiguration
- `X-Api-Key` obrigatório em todas as requisições BFF (validado no middleware)
- CORS restrito às origens do dashboard e backoffice
- Variáveis sensíveis apenas em GitHub Secrets / EC2 `.env` — nunca em código

### A07 — Identification and Authentication Failures
- E-mail: regex RFC 5321 + limite 254 chars
- Telefone: formato E.164 (`+\d{10,15}`)
- CPF: 11 dígitos + checksum oficial
- Rate limit no login e no registro público

### A09 — Security Logging and Monitoring
- Sentry em todos os serviços com breadcrumbs nos consumers RabbitMQ
- `captureException` para erros; `captureMessage(level: 'warning')` para validações e 4xx
- Nunca logar dados sensíveis (CPF, senhas, tokens)

---

## Fluxos implementados

### Conversão FIAT ↔ BRLN (com aprovação)
- **Compra (FIAT→BRLN)**: usuário cria pedido → admin aprova → BFF debita FIAT + cria statement + publica `EXCHANGE_TOKEN_TRANSFER_REQUEST` → dfns executa on-chain → consumer atualiza conversão para `completed`
- **Venda (BRLN→FIAT)**: usuário cria pedido → admin aprova → BFF cria `transfer_request` com `conversionRequestId` + publica `EXCHANGE_USER_TRANSFER_REQUEST` → dfns executa on-chain → consumer credita FIAT + atualiza conversão para `completed`
- Stores: `conversion-request-store.ts` no BFF
- Status: `pending_approval → executing → completed | failed | rejected`

### Auto-registro de usuários
- Usuário preenche `/register` (público) → `POST /public/register-request` → status `pending`
- Admin aprova no backoffice → BFF cria usuário no Cognito (CPF como username) + credita R$1.000 FIAT
- Store: `registration-request-store.ts` no BFF

### Transferência BRLN entre usuários
- Usuário solicita no dashboard → admin aprova no backoffice → dfns executa on-chain com wallet do próprio usuário
- Store: `transfer-request-store.ts` com campo `conversionRequestId` para rastrear vendas

---

## RabbitMQ — Mapa de exchanges e filas

| Serviço | Publica em | Escuta em |
|---|---|---|
| BFF | EXCHANGE_TOKEN_TRANSFER_REQUEST | bff_listen_token_transfer_response |
| dfns | — | dfns_listen_token_transfer_request |
| dfns | EXCHANGE_TOKEN_TRANSFER_RESPONSE | — |
| BFF | EXCHANGE_USER_TRANSFER_REQUEST | bff_listen_user_transfer_response |
| dfns | — | dfns_listen_user_transfer_request |
| dfns | EXCHANGE_USER_TRANSFER_RESPONSE | — |

---

## Regras de workflow

- **Publicar** = `git add src/ && git commit && git push origin main` (nunca commitar `dist/`)
- **Antes de commitar**: `git status` para confirmar arquivos; nunca `git add .` sem verificar
- **Ao terminar uma tarefa**: listar quais projetos foram alterados
- **Mudanças em múltiplos projetos**: commitar e publicar cada um separadamente
- **Renomear env vars**: grep em todos os arquivos `src/` antes de renomear
- **TypeScript `exactOptionalPropertyTypes: true`** ativo no dfns-integration: usar spread condicional `...(val !== undefined && { key: val })`

---

## Infraestrutura AWS (produção)

| Recurso | Endereço |
|---|---|
| BFF | https://bff.tokeniza.net (ALB → EC2 i-04f83f2cce1462d2b :3000) |
| Backoffice | https://backoffice.tokeniza.net (CloudFront E3U2PEXLOTTF5O) |
| Dashboard | https://tokeniza.net (CloudFront E32ZZHRT5D7JWV) |
| DocumentDB | docdb-2026-05-20-04-49-34.cluster-ctoiotnphb4x.us-east-1.docdb.amazonaws.com:27017 |
| Redis | cripto-controller-redis.qjuhvv.0001.use1.cache.amazonaws.com:6379 |
| AmazonMQ | b-48042934-0490-4b8d-b2a6-012560ff9231.mq.us-east-1.on.aws:5671 |
| EC2 | IP 13.220.118.134 · acesso via SSM ou `~/Downloads/novo-keypair.pem` |

**CRÍTICO**: BFF e dfns na EC2 devem usar `--network cripto-net` — RabbitMQ roda nessa rede com hostname `rabbitmq`.
