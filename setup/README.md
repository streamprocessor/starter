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
./setup/setup.sh # Enables required API:s and IAM:s
```

### 2.3 Get access to StreamProcessor artifacts

[Fill in the alpha access request form](https://forms.gle/A9Xu3fV5kYs1j3KC7) to get permission to use the ready made docker images. This step is required for the starter kit to work.

### 2.4 Connect GitHub Repository to Cloud Build
If you want to run StreamProcessor in gitOps style, then you need to set up a connection between cloud build and your private streamprocessor repository. This is optional if you want to run all builds from your console instead, but we recommend the gitOps style as you get many benefits from that and it enables a collaborative setup.

Go to cloud build > [manage repositories](https://console.cloud.google.com/cloud-build/repos) and click **connect repository**

1. Select source -> GitHub (Cloud Build App)
2. Authenticate to your GitHub account.
3. Select your streamprocessor repository and connect.
