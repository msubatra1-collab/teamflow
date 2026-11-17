FROM node:22-alpine AS build
WORKDIR /app
RUN npm install --global npm@10.9.9
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache ca-certificates
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/with-mysql-tls.mjs ./scripts/with-mysql-tls.mjs
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["sh", "-c", "node scripts/with-mysql-tls.mjs prisma migrate deploy && exec node dist/server/src/index.js"]
