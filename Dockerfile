
#
# Builder
#
FROM node:24-alpine3.22 AS builder

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
FROM node:24-alpine3.22

WORKDIR /app

RUN apk update && apk add curl git openssh

COPY ./package.json .
COPY ./package-lock.json .
RUN npm ci --omit=dev

COPY --from=builder /app/dist .

CMD [ "node", "main.js" ]
