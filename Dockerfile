# Build the Vite app, then serve the static bundle with nginx (mirrors the
# trova-experience dashboard pattern).
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The public tokenization key is inlined into the bundle at build time.
ARG VITE_NMI_TOKENIZATION_KEY
ENV VITE_NMI_TOKENIZATION_KEY=$VITE_NMI_TOKENIZATION_KEY
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
