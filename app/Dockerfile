# syntax=docker/dockerfile:1

# ─── Сборка ───
FROM node:24-alpine AS build
WORKDIR /src

# package.json отдельным слоем: пока зависимости не менялись,
# npm ci берётся из кеша и сборка идёт секунды, а не минуты.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Раздача ───
# Непривилегированный образ: nginx внутри работает не от root.
# ACA этого не требует, но получить это бесплатно приятнее, чем объяснять потом.
FROM nginxinc/nginx-unprivileged:1.29-alpine

# Порт задаётся переменной, конфиг собирается из шаблона на старте.
ENV PORT=8080

COPY --from=build /src/dist/razgon/browser /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080
