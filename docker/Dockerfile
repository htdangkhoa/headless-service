FROM --platform=linux/amd64 ubuntu:20.04 AS node

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

RUN apt-get update && apt-get install -y \
  curl \
  git \
  unzip \
  wget \
  && rm -rf /var/lib/apt/lists/*

RUN curl -sL https://deb.nodesource.com/setup_18.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@9

ENV PNPM_VERSION 8.15.4
RUN npm install -g pnpm@"$PNPM_VERSION"

FROM node AS chrome

RUN apt-get update && apt-get install -y \
  xorg \
  xvfb \
  gtk2-engines-pixbuf \
  && rm -rf /var/lib/apt/lists/*

RUN npx --yes playwright install --with-deps chrome

ENV PUPPETEER_EXECUTABLE_PATH='/usr/bin/google-chrome-stable'

COPY docker/startup.sh /startup.sh
RUN chmod +x /startup.sh

ENTRYPOINT ["/startup.sh"]

FROM chrome AS builder

WORKDIR /app

COPY ./.npmrc ./package.json ./pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prefer-offline

COPY ./tsconfig.json ./
COPY ./tsconfig.build.json ./

COPY ./extensions ./extensions
COPY ./public ./public
COPY ./scripts ./scripts
COPY ./src ./src

RUN pnpm run /^build:.*/ && \
  pnpm run build

RUN pnpm install --prod --frozen-lockfile --prefer-offline

FROM chrome AS final

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/extensions ./extensions
COPY --from=builder /app/package.json ./package.json

CMD ["pnpm", "run", "start"]

EXPOSE 3000