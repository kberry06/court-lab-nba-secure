FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    TZ=Australia/Sydney \
    DATA_DIR=/data/court-nba \
    ODDS_PROVIDER=manual \
    ODDS_FEED_APPROVED=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY public ./public
COPY deploy ./deploy
COPY model-artifact.json ./
COPY player-history-artifact.json ./
COPY game-model-artifact.json player-model-artifact.json allocation-research-artifact.json advanced-research-artifact.json historical-inputs-artifact.json minutes-research-artifact.json ./
EXPOSE 10000
CMD ["node", "deploy/reuse-service.mjs"]
