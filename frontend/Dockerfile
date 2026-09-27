FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SHOW_DEMO_CREDENTIALS=false
ENV VITE_SHOW_DEMO_CREDENTIALS=$VITE_SHOW_DEMO_CREDENTIALS
RUN npm run build
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
