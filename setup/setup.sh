#!/bin/bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
CLOUD_BUILD_SERVICE_ACCOUNT=${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com

gcloud services enable cloudbuild.googleapis.com cloudresourcemanager.googleapis.com

# Temporarily grant the cloud build service account the project admin role.
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUD_BUILD_SERVICE_ACCOUNT" \
    --role="roles/owner"

# Run the setup build
gcloud builds submit --config=./setup/cloudbuild.yaml ./setup

# Revoke the project admin role from cloud build service account
gcloud projects remove-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUD_BUILD_SERVICE_ACCOUNT" \
    --role="roles/owner"