FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS builder

ARG NEXT_PUBLIC_GATEWAY_URL="http://127.0.0.1:4000"
ARG NEXT_PUBLIC_ENABLE_DEMO_AUTH="true"
ARG NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH="false"
ARG NEXT_PUBLIC_USE_REMOTE_LOYALTY_API="true"
ARG NEXT_PUBLIC_USE_LOCAL_LOYALTY_API="false"

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL \
    NEXT_PUBLIC_ENABLE_DEMO_AUTH=$NEXT_PUBLIC_ENABLE_DEMO_AUTH \
    NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH=$NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH \
    NEXT_PUBLIC_USE_REMOTE_LOYALTY_API=$NEXT_PUBLIC_USE_REMOTE_LOYALTY_API \
    NEXT_PUBLIC_USE_LOCAL_LOYALTY_API=$NEXT_PUBLIC_USE_LOCAL_LOYALTY_API

COPY . .
RUN --mount=type=secret,id=frontend_env,target=/app/.env.local npm run build

FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
