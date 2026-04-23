FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY requirements.txt ./
RUN python3 -m pip install --no-cache-dir -r requirements.txt --break-system-packages

COPY . .

ENV CHAT_API_HOST=0.0.0.0
ENV CHAT_API_PORT=11435
ENV WEB_HOST=0.0.0.0
ENV WEB_PORT=4200
ENV WEB_PROXY_CONFIG=proxy.conf.json

EXPOSE 4200 11435

CMD ["npm", "start"]
