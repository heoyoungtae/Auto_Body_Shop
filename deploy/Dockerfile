FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production STORAGE_DIR=/data/files PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && exec npx next start"]
