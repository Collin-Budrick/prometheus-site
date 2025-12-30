FROM node:20-alpine as base
WORKDIR /app
RUN apk add --no-cache curl unzip bash
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

COPY package.json bun.lock ./
COPY bunfig.toml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY patches ./patches
RUN bun install --ignore-scripts

COPY apps/web ./apps/web
COPY apps/api/src ./apps/api/src
RUN bun run --cwd apps/web build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl unzip bash
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

ENV WEB_PORT=4173
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/web ./apps/web
EXPOSE 4173
CMD ["bun", "run", "--cwd", "apps/web", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
