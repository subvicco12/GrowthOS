# Pass a separately verified Node.js 22 image digest; never use a mutable tag.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
