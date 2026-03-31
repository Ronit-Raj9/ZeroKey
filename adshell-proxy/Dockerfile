FROM oven/bun:1

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY abi ./abi

RUN PRISMA_SKIP_POSTINSTALL_GENERATE=1 bun install

EXPOSE 4021

CMD ["sh", "-c", "bunx prisma generate && bun run start"]
