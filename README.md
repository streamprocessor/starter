# streamprocessor dataflow starter kit
This repository contains everything you need to get started with StreamProcessor. The use of StreamProcessor requires some basic knowledge in git (clone, commit, push, pull, checkout) but that will give you versioning, reproducability, collaboration, and much more.

If you find any bugs or issues in the starter kit, please [report the bug/issue here.](https://github.com/streamprocessor/starter/issues). There is also a support channel in the StreamProcessor slack community.

---

## 1. Private copy of the starter repository
Follow the steps to get a private copy of the public starter repository, while being able to sync changes from the original starter repository.

1. Create your own private [repository on GitHub](https://docs.github.com/en/articles/creating-a-new-repository), ex. https://github.com/exampleuser/streamprocessor.git
2. Open [cloud console](https://ide.cloud.google.com) and run:
 
```bash
# Clone the public starter repository
git clone --bare https://github.com/streamprocessor/starter.git

# Mirror-push to the new repository.
cd starter.git
git push --mirror https://github.com/exampleuser/streamprocessor.git

# Remove the temporary local repository you created earlier.
cd ..
rm -rf starter.git

# Clone the private repo so you can work on it.
git clone https://github.com/exampleuser/streamprocessor.git
cd streamprocessor

# Add a remote to the public starter repo to pull changes if needed.
git remote add public https://github.com/streamprocessor/starter.git
```
Now you should have a local and remote repository containing the latest version of the starter template code.

---

## 2. Setup
### 2.1. Project and Billing

In order to run StreamProcessor you need a valid GCP project with billing enabled.

[Create a project](https://cloud.google.com/resource-manager/docs/creating-managing-projects#creating_a_project)

[Enable billing for your project](https://console.cloud.google.com/billing/projects) 

### 2.2 Enable API:s and IAM

This step enables API:s, binds roles to service accounts.

```bash
# Replace [PROJECT_ID] with your GCP project's ID
gcloud config set project [PROJECT_ID]

PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
CLOUD_BUILD_SERVICE_ACCOUNT=${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com

# Temporarily grant the cloud build service account the project admin role.
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUD_BUILD_SERVICE_ACCOUNT" \
    --role="roles/admin"

# Run the setup build
gcloud builds submit --config=./infra/cloudbuild.yaml ./infra

# Revoke the project admin role from cloud build service account
gcloud projects remove-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUD_BUILD_SERVICE_ACCOUNT" \
    --role="roles/admin"
```


### 2.3 Get access to StreamProcessor artifacts

[Fill in the alpha access request form](https://forms.gle/A9Xu3fV5kYs1j3KC7) to get permission to use the ready made docker images.

### 2.4 Shared infrastructure
This step creates infrastructure that is shared across the pipelines, i.e. staging buckets, schema registry, etc.



---

## 3. Pipelines
Here you find instructions for setting up different pipelines.

### 3.1 com.google.analytics.v1

```bash
# create a pipeline branch
git checkout -b pipeline/com.google.analytics.v1

# make changes to code/configuration

# commit and push code to remote
git add .
git commit
git push origin pipeline/com.google.analytics.v1
# make pull request to merge into develop and then to main

# switch back to main branch
git checkout main
```






---


## ?. Update with the latest changes in the public starter repository
To update your private repo with the latest changes in the public starter repository.

```bash
# first make sure working directory is streamprocessor (cd streamprocessor)
git pull public master # Creates a merge commit
git push origin master
```











### tip
If using cloud shell ide, add the following file association to make it easier (suntax highlighting) to work with avro files (.avsc).

```json
"files.associations": {
    "*.avsc": "json"
}
```
