#!/bin/bash
set -e

PROJECT="trova-mobile-api"
REGION="us-central1"
# Reuses the existing Artifact Registry repo from trova-experience. To use a
# dedicated repo instead, create it once:
#   gcloud artifacts repositories create nmi-test \
#     --repository-format=docker --location="$REGION"
# ...and change "trova-experience" below to "nmi-test".
REGISTRY="$REGION-docker.pkg.dev/$PROJECT/trova-experience"
SERVICE="nmi-test"
IMAGE="$REGISTRY/nmi-test:latest"

# Load the public tokenization key from .env.local (kept out of the repo).
if [ -f .env.local ]; then
  set -a; . ./.env.local; set +a
fi
if [ -z "$VITE_NMI_TOKENIZATION_KEY" ]; then
  echo "ERROR: VITE_NMI_TOKENIZATION_KEY is not set (put it in .env.local)." >&2
  exit 1
fi

echo "Building image..."
docker build --platform linux/amd64 \
  --build-arg VITE_NMI_TOKENIZATION_KEY="$VITE_NMI_TOKENIZATION_KEY" \
  -t "$IMAGE" .

echo "Pushing image..."
docker push "$IMAGE"

echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format "value(status.url)")
echo "Deployed at: $URL"
