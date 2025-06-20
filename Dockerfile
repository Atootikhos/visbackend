# Stage 1: Build environment
FROM node:20-slim AS build

# Install necessary tools: git and git-lfs
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y git git-lfs ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Set up the working directory
WORKDIR /app

# --- Git LFS Setup ---
# Initialize a new, temporary git repository
RUN git init

# Add the remote repository URL
RUN git remote add origin https://github.com/Atootikhos/visbackend.git

# Enable sparse checkout to only fetch necessary files
RUN git config core.sparseCheckout true
# Define which files/folders to fetch (everything except node_modules)
RUN echo "/*\n!/node_modules" > .git/info/sparse-checkout

# Fetch the repository history
RUN git fetch --depth=1 origin main

# Checkout the files from the fetched history
RUN git checkout main

# Initialize Git LFS in the container
RUN git lfs install

# Now, pull the large files tracked by Git LFS
RUN git lfs pull
# --- End Git LFS Setup ---

# Install dependencies
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
