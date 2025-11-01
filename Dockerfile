
#
# Builder
#
FROM node:24-alpine3.19 AS builder

WORKDIR /app

COPY ./package.json .
COPY ./package-lock.json .

RUN npm ci

COPY ./src ./src
COPY ./tsconfig.json .
RUN npm run build

#
# Runtime
#
FROM node:24-alpine3.19

WORKDIR /app

COPY ./package.json .
COPY ./package-lock.json .
RUN npm ci --omit=dev

COPY --from=builder /app/dist .

CMD [ "node", "main.js" ]
