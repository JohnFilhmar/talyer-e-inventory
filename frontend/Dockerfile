# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* values are inlined at build time, so they must be build args.
#
# Three separate values, and they are not interchangeable:
#   NEXT_PUBLIC_API_URL     - API base. MUST carry the /api suffix.
#   NEXT_PUBLIC_BACKEND_URL - origin used to expand legacy relative image
#                             paths (/uploads/...) in the product components.
#                             MUST NOT carry /api, or the URL becomes
#                             http://host/api/uploads/... and 404s.
#   NEXT_PUBLIC_IMAGE_HOST  - origin allow-listed for next/image in
#                             next.config.ts. Also without /api.
ARG NEXT_PUBLIC_API_URL=http://localhost:5000/api
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
ARG NEXT_PUBLIC_IMAGE_HOST=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_IMAGE_HOST=$NEXT_PUBLIC_IMAGE_HOST
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache tini

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
