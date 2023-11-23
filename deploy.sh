#!/bin/sh

# Build the docker image
docker build -t tt .

# Stop the docker image
docker stop tictac

# Run the docker image
docker run -p 3000:3000 --env-file .env -d -n tictac tt:latest
