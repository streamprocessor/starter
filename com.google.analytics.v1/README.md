# 1 com.google.analytics.v1
This is a streaming pipeline for Google Analytics data (universal analytics). You set up a client script that copies the querystring payload and also send it to your own endpoint where the pipeline first transform it to a suitable JSON structure before serializing it and writing it to BigQuery and a pubsub topic.

## 1.1 Cloud build triggers
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
## 1.2 Apply changes (GitOps)

```bash
# create a pipeline branch
git checkout -b pipeline/com.google.analytics.v1
```

### 1.2.1 Change the settings in com.google.analytics.v1/index.ts

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

### 1.2.2 Create a schema in com.google.analytics.v1/schemas/ 
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
### 1.2.3 Deploy your changes

```bash
# commit and push code to remote
git add .
git commit
git push origin pipeline/com.google.analytics.v1

# goto github and make a pull request to merge into develop (previews pipeline changes) and then to main (deploys the changes)

# switch back to main branch
git checkout main
```