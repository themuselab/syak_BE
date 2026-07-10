FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# 이미지 생성 프롬프트는 런타임에 읽는다. 빠뜨리면 /admin/marketing/images/generate 가 500.
COPY scripts/marketing/image-recipes.json ./scripts/marketing/image-recipes.json
EXPOSE 3000
CMD ["node", "dist/server.js"]
