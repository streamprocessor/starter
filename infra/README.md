# 1 Shared infrastructure
This step creates infrastructure that is shared across the pipelines, i.e. staging buckets, schema registry, etc.

## 1.1 Cloud build triggers
In order to trigger a pulumi preview (continous integration) and pulumi up (continous deploy) of your streamprocessor shared infra, you need to set up two cloud build triggers, one to run pulumi preview on pull request and one to run pulumi up on the merge (push).

```bash
# Your GitHub USER/ORG for the streamprocessor repo
USER=

# A trigger to run pulumi preview (integration) on pull request
gcloud beta builds triggers create github \
 --name="streamprocessor-infra-ci" \
 --repo-owner="${USER}" \
 --repo-name="streamprocessor" \
 --pull-request-pattern="^main$" \
 --comment-control="COMMENTS_DISABLED" \
 --included-files="infra/**" \
 --build-config="infra/cloudbuild.pulumi.yaml"

# A trigger to run pulumi up (deployment) on pull request
gcloud beta builds triggers create github \
 --name="streamprocessor-infra-cd" \
 --repo-owner="${USER}" \
 --repo-name="streamprocessor" \
 --branch-pattern="^main$" \
 --included-files="infra/**" \
 --build-config="infra/cloudbuild.pulumi.yaml" \
 --substitutions _BUILD_TYPE=up
```
## 1.2 Apply changes (GitOps)
Then checkout an infra branch, change the settings in infra/index.ts to reflect your setup, add/commit and push the changes to your remote streamprocessor GitHub repository.

```bash
# create a pipeline branch in your console
git checkout -b infra
```

Make changes to settings in infra/index.ts in your IDE (see below)

```javascript
// infra/index.ts

/*** START SETTINGS ***/
const bigQueryLocation = "EU"; // set region for BigQuery Dataset

/*** END SETTINGS ***/
 ```

Commit and push code to remote

```bash
git add .
git commit -m "modified infra settings"
git push origin infra
```

Go to github and make a pull request to merge into main (previews infra changes) and then merge it (deploys the changes). You can check status both in GitHub checks and Cloud Build.

Switch back to main branch in your console and update your local main branch from remote.

```bash
git checkout main
git pull origin main
```
 
Now you should have the following shared resources set up in your project.

1. Bucket for schemas
2. Bucket for staging of dataflow jobs
3. Pubsub topic for dead letter messages
4. Pubsub topic for backup of messages
5. Pubsub backup subscription of messages
6. Cloud Run service to collect messages
7. Pubsub topic for collected messages
8. Cloud run service acting as schema registry
9. BigQuery dataset for infra related data (schemas, subjects, stacks, backups, etc.)