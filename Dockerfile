FROM node:20-bullseye

RUN apt-get update && apt-get install curl gnupg -y \
  && curl --location --silent https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
  && apt-get update \
  && apt-get install google-chrome-stable -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

COPY pnpm-lock.yaml  .
COPY package.json  .

RUN pnpm install

RUN cd ./node_modules/puppeteer && node install.mjs

COPY . .

RUN pnpm build

CMD [ "node", "./dist/index.js" ]
