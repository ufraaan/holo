FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_SIGNALING_URL=ws://localhost:8788/ws
ENV NEXT_PUBLIC_SIGNALING_URL=${NEXT_PUBLIC_SIGNALING_URL}

RUN bun run build

FROM node:22-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
