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
ENV SCM_GATEWAY_PORT=3011
EXPOSE 3011
CMD ["node", "dist/server.js"]
