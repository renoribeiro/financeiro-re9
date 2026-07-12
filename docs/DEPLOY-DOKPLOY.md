# Deploy no Dokploy (VPS Hostinger)

Guia para subir a **RE9 Finanças** como container no [Dokploy](https://dokploy.com)
rodando numa VPS da Hostinger. O Dokploy já traz o proxy reverso (Traefik), SSL
automático (Let's Encrypt) e build a partir do repositório GitHub — então **não**
precisamos de Traefik, GHCR nem GitHub Actions de deploy no nosso código.

Repositório: `https://github.com/renoribeiro/financeiro-re9`

---

## O que já está pronto no repositório

| Arquivo | Função |
|---------|--------|
| `Dockerfile` | Build multi-stage do Nuxt (SSR / Nitro node-server). Roda como usuário não-root, expõe a porta **3000**, tem `HEALTHCHECK`. |
| `.dockerignore` | Mantém o contexto de build enxuto. |
| `docker-compose.yml` | Alternativa para o modo *Compose* do Dokploy ou teste local (sem Traefik). |
| `server/api/health.get.ts` | Endpoint público `GET /api/health` para health check. |
| `.github/workflows/ci.yml` | CI (test + build) — portão de qualidade, **não** faz deploy. |

A aplicação escuta em `HOST=0.0.0.0` / `PORT=3000` (definidos no `Dockerfile`).

---

## Pré-requisitos na VPS

1. **VPS Hostinger** (Ubuntu 22.04/24.04). Recomendado **≥ 4 GB de RAM** — o build
   do Nuxt usa até ~4 GB. Em VPS de 2 GB o build pode falhar por falta de memória
   (ver *Solução de problemas*).
2. **Dokploy instalado**:
   ```sh
   curl -sSL https://dokploy.com/install.sh | sh
   ```
   Acesse o painel em `http://SEU_IP:3000` e crie o usuário admin.
3. Um **domínio/subdomínio** apontando (registro A) para o IP da VPS, ex.:
   `financeiro.re9imob.com.br → IP_DA_VPS`.

---

## Passo a passo (tipo *Application* + Dockerfile — recomendado)

1. No painel do Dokploy: **Create Project** → dê um nome (ex.: `re9-financeiro`).
2. Dentro do projeto: **Create Service → Application**.
3. **Provider = GitHub**. Conecte a conta GitHub (GitHub App do Dokploy) e selecione
   o repositório `renoribeiro/financeiro-re9`, branch **`main`**.
   - Sem GitHub App? Use *Git* com a URL do repo + uma **Deploy Key** (o Dokploy
     gera a chave; adicione em GitHub → repo → Settings → Deploy keys).
4. **Build Type = `Dockerfile`** (caminho: `Dockerfile`, contexto: `.`).
5. Aba **Environment**: adicione as variáveis que precisar (ver `.env.example`).
   No modo mock atual **nenhuma é obrigatória**. Não suba arquivo `.env`.
6. Aba **Domains**: **Add Domain**
   - Host: `financeiro.re9imob.com.br`
   - **Container/Service Port: `3000`**
   - Ative **HTTPS** + **Let's Encrypt** (certificado automático).
7. (Opcional) **Advanced → Health Check** — path `/api/health`, porta `3000`.
8. Clique em **Deploy**. Acompanhe os logs de build. Ao terminar, acesse o domínio.
9. **Auto Deploy**: ative para que cada `push` na `main` dispare um novo deploy
   automaticamente (o Dokploy cria o webhook no GitHub).

### Login de demonstração
`reno@re9.online` (Super Admin) — qualquer senha. Outros usuários no README.

---

## Alternativa: modo *Compose*

Se preferir usar **Create Service → Compose**: aponte para o `docker-compose.yml`
do repo. Ele não publica portas no host nem inclui Traefik — configure o domínio
pela aba **Domains** do Dokploy apontando para o serviço `app` na porta `3000`.

---

## Solução de problemas

- **Build morre / "JavaScript heap out of memory"**: a VPS não tem RAM suficiente
  para o build. Opções:
  1. Suba temporariamente para um plano com mais RAM, faça o deploy e volte; ou
  2. Adicione **swap** na VPS:
     ```sh
     fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
     echo '/swapfile none swap sw 0 0' >> /etc/fstab
     ```
  3. Ou faça o build na CI (GitHub Actions) e publique a imagem num registry para
     o Dokploy apenas puxar (deploy por imagem, sem build na VPS).
- **502 / Bad Gateway logo após o deploy**: o container ainda está subindo — o
  health check (`/api/health`) segura o roteamento até ficar saudável. Aguarde.
- **Domínio sem HTTPS**: confirme o registro A apontando para o IP e as portas
  **80/443** liberadas no firewall da VPS (`ufw allow 80,443/tcp`).
- **Erro de porta**: o serviço escuta na **3000**; use exatamente essa porta na
  aba Domains.
