# syntax=docker/dockerfile:1

FROM node:22-slim AS base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./tsconfig.json
COPY src ./src

RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist

ENV NODE_ENV=production
ENV SCM_CAMPAIGN_PORT=3014
EXPOSE 3014
CMD ["node", "dist/server.js"]
