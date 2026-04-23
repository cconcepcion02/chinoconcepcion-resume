# Run Instructions

## Requirements

- Docker Desktop or Docker Engine
- Ollama running on your host machine
- The configured Ollama model pulled locally

The current model is configured in `.env`:

```bash
OLLAMA_MODEL=gemma4:e4b
```

If the model is not installed yet, pull it with:

```bash
ollama pull gemma4:e4b
```

## Run With Docker

Build and start the site with one command:

```bash
docker compose up -d --build
```

Open the site:

```text
http://localhost:4200
```

The local chat API is exposed at:

```text
http://localhost:11435
```

## Check Status

```bash
docker compose ps
```

## View Logs

```bash
docker compose logs -f app
```

## Stop The Site

```bash
docker compose down
```

## Run Without Docker

Install dependencies:

```bash
npm install
```

Start the frontend and API together:

```bash
npm start
```

Open:

```text
http://localhost:4200
```

## Notes

- The Docker setup uses one container named `app`.
- The container runs both the Angular frontend and the Node chat API.
- The app connects to Ollama on the host through `host.docker.internal:11434`.
- If chat does not respond, confirm Ollama is running and the model in `.env` exists locally.

## Deploy To Apache As Static Site

If you only need the portfolio pages to work and do not need the chat assistant, build the Apache package:

```bash
npm install
npm run build:apache
```

After the build finishes, copy the generated folder to your Apache web directory:

```text
dist/apache/browser
```

Copy everything inside that folder into your Apache site folder such as:

```text
/var/www/html/your-site/
```

Then open the site from Apache in the browser.

Notes for Apache deployment:

- This build is static and Apache-ready.
- The AI chat assistant is intentionally disabled in this build.
- Asset paths use relative links so the site can be served from a folder, not only from the domain root.
