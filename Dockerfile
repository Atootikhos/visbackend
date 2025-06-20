# Stage 1: Build environment
FROM node:20-slim AS build

# Install necessary tools: git and git-lfs
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y git git-lfs && \
    rm -rf /var/lib/apt/lists/*

# Set up the working directory
WORKDIR /app

# Initialize Git LFS
RUN git lfs install

# Copy repository files
COPY . .

# Pull the large files tracked by Git LFS
RUN git lfs pull

# Install all dependencies, including devDependencies for the build step
RUN npm install

# Build the TypeScript application
RUN npm run build

# Remove development dependencies for a smaller final image
RUN npm prune --production


# Stage 2: Final production image
FROM node:20-slim AS final

# Set production environment
ENV NODE_ENV=production

# Set up the working directory
WORKDIR /app

# Copy the built application, node_modules, and public assets from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server

# Expose the port the app will listen on
EXPOSE 8080

# Start the server
CMD [ "node", "dist/server.js" ]
