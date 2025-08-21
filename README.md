# youtube-filter

A simple Next.js application for filtering YouTube videos.

## Running with Docker

Build the image:

```bash
docker build -t youtube-filter .
```

Run the container:

```bash
docker run -p 3000:3000 youtube-filter
```

The application will be available at http://localhost:3000.

## Running with Docker Compose

Build and start the application:

```bash
docker compose up --build
```

This command builds the image and starts the container with port 3000 exposed. The application will be available at http://localhost:3000.

To stop the containers, run:

```bash
docker compose down
```
