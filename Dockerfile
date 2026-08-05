# Epic BOS - server image (self-contained: API + UI). Runs anywhere Docker runs.
FROM node:24-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm install --no-audit --no-fund
COPY server/ ./
ENV PORT=3001 HOST=0.0.0.0 EPIC_DATA_FILE=/app/data/epic.json GSP_PROVIDER=sandbox
RUN mkdir -p /app/data
EXPOSE 3001
VOLUME ["/app/data"]
# data dir must be writable for the JSON store
CMD ["npx", "tsx", "src/index.ts"]
