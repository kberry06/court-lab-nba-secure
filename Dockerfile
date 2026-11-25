FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    TZ=Australia/Sydney \
    DATA_DIR=/data/court-nba \
    ODDS_PROVIDER=manual \
    ODDS_FEED_APPROVED=false
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/injury-parser \
    && /opt/injury-parser/bin/pip install --no-cache-dir pdfplumber==0.11.9
ENV PATH="/opt/injury-parser/bin:${PATH}"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY scripts/extract-injury-pdf.py ./scripts/extract-injury-pdf.py
COPY public ./public
COPY deploy ./deploy
COPY model-artifact.json ./
COPY player-history-artifact.json ./
COPY game-model-artifact.json player-model-artifact.json allocation-research-artifact.json advanced-research-artifact.json historical-inputs-artifact.json minutes-research-artifact.json minute-learning-artifact.json minute-shadow-model.json minute-regime-artifact.json minute-participation-artifact.json minute-balanced-artifact.json minute-joint-artifact.json ./
COPY player-count-model.json player-count-research-artifact.json ./
EXPOSE 10000
CMD ["node", "deploy/reuse-service.mjs"]
