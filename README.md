# StreamProcessor starter kit
This repository contains everything you need to get started with StreamProcessor. The GitOps mode (preferred) of StreamProcessor requires some basic knowledge in git (clone, commit, push, pull, checkout) but that will give you versioning, reproducability, collaboration, and much more.

If you find any bugs or issues in the starter kit, please [report the bug/issue here.](https://github.com/streamprocessor/starter/issues). There is also a support channel in the StreamProcessor slack community.

---

## 1. Private copy of the starter repository
Follow the steps to get a private copy of the public starter repository, while being able to sync changes from the original starter repository.

1. Create your own private streamprocessor [repository on GitHub](https://docs.github.com/en/articles/creating-a-new-repository)  (https://github.com/[USER]/streamprocessor.git)
2. Open [cloud console](https://ide.cloud.google.com) and run:

```bash
# Replace USER
PRIVATE_REPO=https://github.com/USER/streamprocessor.git

# Clone the public starter repository
git clone --bare https://github.com/streamprocessor/starter.git

# Mirror-push to the new repository.
cd starter.git
git push --mirror ${PRIVATE_REPO}

# Remove the temporary local repository you created earlier.
cd ..
rm -rf starter.git

# Clone the private repo so you can work on it.
git clone ${PRIVATE_REPO}
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

### 2.5 Shared infrastructure
This step creates infrastructure that is shared across the pipelines, i.e. staging buckets, schema registry, etc.

You can either set up your shared infra manually or with gitOps style using a cloud build trigger (preferred).

#### 2.5.1 Cloud build triggers
In order to trigger a pulumi preview (continous integration) and pulumi up (continous deploy) of your streamprocessor shared infra, you need to set up two cloud build triggers, one to run pulumi preview on pull request and one to run pulumi up on the merge (push).

```bash
# A trigger to run pulumi preview (integration) on pull request
gcloud beta builds triggers create github \
 --name="streamprocessor-infra-ci" \
 --repo-owner="[USER]" \
 --repo-name="streamprocessor" \
 --pull-request-pattern="^main$" \
 --comment-control="COMMENTS_DISABLED" \
 --included-files="infra/**" \ 
 --build-config="infra/cloudbuild.pulumi.yaml"

# A trigger to run pulumi up (deployment) on pull request
gcloud beta builds triggers create github \
 --name="streamprocessor-infra-cd" \
 --repo-owner="[USER]" \
 --repo-name="streamprocessor" \
 --branch-pattern="^main$" \
 --included-files="infra/**" \
 --build-config="infra/cloudbuild.pulumi.yaml" \
 --substitutions _BUILD_TYPE=up
```
#### 2.5.2 Apply changes (GitOps)
Then checkout an infra branch, change the settings in infra/index.ts to reflect your setup, add/commit and push the changes to your remote streamprocessor GitHub repository.

```bash
# create a pipeline branch in your console
git checkout -b infra

# make changes to settings in infra/index.ts in your IDE (see below)

# commit and push code to remote
git add .
git commit -m "modified infra settings"
git push origin infra

# goto github and make a pull request to merge into main (previews infra changes) and then merge it (deploys the changes). You can check status both in GitHub checks and Cloud Build.

# switch back to main branch in your console
git checkout main
```

**Change the settings in infra/index.ts** to reflect your setup:

 ```javascript
// infra/index.ts

/*** START SETTINGS ***/
const bigQueryLocation = "EU"; // set region for BigQuery Dataset
const collectorApiKeys = "12345"; // comma separated list of api keys
const collectorAllowedOrigins = "https://myawesomesite.com"; // comma separated list of allowed origins
/*** END SETTINGS ***/
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

---

## 3. Pipelines
Here you find instructions for setting up different pipelines. Common for all pipelines are the following files:

* schemas/*.avsc - One or multiple Avro schema files used to serialize the messages.
* cloud.pulumi.yaml - Cloud Build configuration file to enable CI/CD
* index.ts - The program (typescript) declaring your infrastructure stack
* package.json - The program dependencies
* Pulumi.yaml - The project file containing program settings
* tsconfig.json - Allows your to set additional TypeScript compiler options (optional)


### 3.1 com.google.analytics.v1
This is a streaming pipeline for Google Analytics data (universal analytics). You set up a client script that copies the querystring payload and also send it to your own endpoint where the pipeline first transform it to a suitable JSON structure before serializing it and writing it to BigQuery and a pubsub topic.

#### 2.5.1 Cloud build triggers
In order to trigger a pulumi preview (continous integration) and pulumi up (continous deploy) of your streamprocessor shared infra, you need to set up two cloud build triggers, one to run pulumi preview on pull request and one to run pulumi up on the merge (push).

```bash
# A trigger to run pulumi preview (integration) on pull request. 
# Replace [USER] with your github user/organisation containing your private remote repository.
gcloud beta builds triggers create github \
 --name="streamprocessor-com-google-analytics-v1-ci" \
 --repo-owner="[USER]" \
 --repo-name="streamprocessor" \
 --pull-request-pattern="^main$" \
 --comment-control="COMMENTS_DISABLED" \
 --included-files="./com.google.analytics.v1/**" \
 --build-config="com.google.analytics.v1/cloudbuild.pulumi.yaml"

# A trigger to run pulumi up (deployment) on pull request. 
# Replace [USER] with your github user/organisation containing your private remote repository.
gcloud beta builds triggers create github \
 --name="streamprocessor-com-google-analytics-v1-cd" \
 --repo-owner="[USER]" \
 --repo-name="streamprocessor" \
 --branch-pattern="^main$" \
 --included-files="./com.google.analytics.v1/**" \
 --build-config="com.google.analytics.v1/cloudbuild.pulumi.yaml" \
 --substitutions _BUILD_TYPE=up
```
#### 2.5.2 Apply changes (GitOps)

```bash
# create a pipeline branch
git checkout -b pipeline/com.google.analytics.v1
```

##### 2.5.2.1 Change the settings in com.google.analytics.v1/index.ts

 ```javascript
// com.google.analytics.v1/index.ts

//VARIABLES
const bigQueryLocation = "EU"; // <-- set region for BigQuery Dataset

// SCHEMA REFERENCES (dependent on order)
// add subject schemas for the properties you stream.
let subjectSchemas: StreamProcessor.SubjectSchema[] = [
   {
        "subject": "com.google.analytics.v1.ua233405661",
        "filename":"/com.google.analytics.v1/schemas/com.google.analytics.v1.ua233405661.avsc",
        "schemaType":"AVRO",
        "references":[]
    },
];
 ```

##### 2.5.2.2 Create a schema in com.google.analytics.v1/schemas/ 
Copy the schema template and name it according to your property id. Add your specific custom dimensions and metrics (hit and product level). The example below shows how the customDimensions and customMetrics can look like. You can also change the doc property on any field, but don't change anything else.

* type = a type that is an array of null and a type is an optional field. A type with only a primitive type (string, int, etc.) and not array is a required field. (required)
* name = the name of the field (required)
* aliases = an alias that maps to this field. In this case cd[index] and cm[index] maps to the index for respective dimension/metric in GA. (required for custom dimensions and metrics, otherwise not required)
* doc = a field description. (optional)
* policyTag = custom property to set the policy tag to apply on a field (optional)
* bigQueryType = custom property to set a BigQuery type not native in Avro types, i.e. TIMESTAMP. (optional) 

```json
...},
{
    "name": "customDimensions",
    "type": [
        "null",
        {
            "type": "record",
            "name": "CustomDimensions",
            "fields": [
                {
                    "name": "tags",
                    "type": [
                        "null",
                        "string"
                    ],
                    "doc": "The blog post's tags",
                    "default": null,
                    "aliases": [
                        "cd1"
                    ]
                },
                {
                    "name": "clientTimestamp",
                    "type": [
                        "null",
                        "string"
                    ],
                    "doc": "The timestamp when the event was created",
                    "default": null,
                    "aliases": [
                        "cd2"
                    ],
                    "bigQueryType": "TIMESTAMP"
                },
                {
                    "name": "secretId",
                    "type": [
                        "null",
                        "int"
                    ],
                    "doc": "Super secret ID number",
                    "default": null,
                    "aliases": [
                        "cd3"
                    ]
                },
                {
                    "name": "myBoolean",
                    "type": [
                        "null",
                        "boolean"
                    ],
                    "doc": "look, it is a boolean",
                    "default": null,
                    "aliases": [
                        "cd4"
                    ]
                }
            ]
        }
    ],
    "default": null
},
{
    "name": "customMetrics",
    "type": [
        "null",
        {
            "type": "record",
            "name": "CustomMetrics",
            "fields": [
                {
                    "name": "randomInt",
                    "type": [
                        "null",
                        "int"
                    ],
                    "doc": "Random number",
                    "default": null,
                    "aliases": [
                        "cm1"
                    ]
                }
            ]
        }
    ],
    "default": null
},
{...
```
#### 2.5.3 Deploy your changes

```bash
# commit and push code to remote
git add .
git commit
git push origin pipeline/com.google.analytics.v1

# goto github and make a pull request to merge into develop (previews pipeline changes) and then to main (deploys the changes)

# switch back to main branch
git checkout main
```

---


## ?. Update with the latest changes in the public starter repository
To update your private repo with the latest changes in the public starter repository.

```bash
# first make sure working directory is streamprocessor (cd streamprocessor)
git pull public main # Creates a merge commit
git push origin main
```











### tip
If using cloud shell ide, add the following file association to make it easier (suntax highlighting) to work with avro files (.avsc).

```json
"files.associations": {
    "*.avsc": "json"
}
```
