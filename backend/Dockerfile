# syntax=docker/dockerfile:1

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:26-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Uploads are written at runtime; create the directory owned by the app user.
RUN mkdir -p /app/uploads/products && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
