# RestaurantOS Express API.
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only (nodemon is the sole dev dep and is not
# needed at runtime). The lockfile is not committed (see .gitignore) and is
# excluded from the build context, so resolve fresh on Linux with npm install.
COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4000

CMD ["node", "src/server.js"]
