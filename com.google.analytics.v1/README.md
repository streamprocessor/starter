# 1 com.google.analytics.v1
This is a streaming pipeline for Google Analytics data (universal analytics). You set up a client script that copies the querystring payload and also send it to your own endpoint where the pipeline first transform it to a suitable JSON structure before serializing it and writing it to BigQuery and a pubsub topic.

## 1.1 Cloud build triggers
In order to trigger a pulumi preview (continous integration) and pulumi up (continous deploy) of your streamprocessor shared infra, you need to set up two cloud build triggers, one to run pulumi preview on pull request and one to run pulumi up on the merge (push).

```bash
# set to your github USER or ORG where you have your private streamprocessor repository
USER=

# A trigger to run pulumi preview (integration) on pull request. 
# Replace [USER] with your github user/organisation containing your private remote repository.
gcloud beta builds triggers create github \
 --name="streamprocessor-com-google-analytics-v1-ci" \
 --repo-owner="${USER}" \
 --repo-name="streamprocessor" \
 --pull-request-pattern="^main$" \
 --comment-control="COMMENTS_DISABLED" \
 --included-files="com.google.analytics.v1/**" \
 --build-config="com.google.analytics.v1/cloudbuild.pulumi.yaml"

# A trigger to run pulumi up (deployment) on pull request. 
# Replace [USER] with your github user/organisation containing your private remote repository.
gcloud beta builds triggers create github \
 --name="streamprocessor-com-google-analytics-v1-cd" \
 --repo-owner="${USER}" \
 --repo-name="streamprocessor" \
 --branch-pattern="^main$" \
 --included-files="com.google.analytics.v1/**" \
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
const collectorApiKeys = "12345"; //comma separated, ex. "123,456"
const collectorAllowedOrigins = "https://myawesomesite.com"; //comma separated, ex. "https://www.streamprocessor.org"

// SCHEMA REFERENCES (dependent on order)
// add subject schemas for the properties you stream.
let subjectSchemas: StreamProcessor.SubjectSchema[] = [
   {
        "subject": "com.google.analytics.v1.uaNNNNNNN",
        "filename":"/com.google.analytics.v1/schemas/com.google.analytics.v1.uaNNNNNNN.avsc",
        "schemaType":"AVRO",
        "references":[]
    },
];
 ```
 * Subject is the name of the event.
 * Filename is the path to the Avro schema file.
 * SchemaType is the type of schema (i.e. Avro)
 * References is used if the schema refers to records defined in another schema. 

### 1.2.2 Create a schema in com.google.analytics.v1/schemas/ 
1. Copy the schema template and name it according to your property id (ex. com.google.analytics.v1.ua1234567.avsc). 
2. Add your specific custom dimensions and metrics (hit and product level). The example below shows how the customDimensions and customMetrics can look like. You can also change the doc property on any field, but don't change anything else. Remember that BigQuery schemas are additive, i.e. you can add fields but not remove them, and you can relax a required field to optional but not the opposite.

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

## 1.3 Add client script
There are many ways to emitt Google Analytics events to your own StreamProcessor collector endpoint.

### 1.3.1 Google Tag Manager (client side)
Google Tag Manager (GTM) lets you add a Google Analytics (GA) custom task to copy the GA payload and send it also to the StreamProcessor collector endpoint.

1. Create a custom javascript variable in GTM and name it "customTask". Add the URL to your collector as the hostname variable in the script below. Save. 
```javascript
function() {
	return function(model) {		
	    var globalSendTaskName = '_' + model.get('trackingId') + '_sendHitTask';
	    var originalSendHitTask = window[globalSendTaskName] = window[globalSendTaskName] || model.get('sendHitTask');
        var hostname = ""; /* the collector URL */
        var subject = model.get('trackingId').toLowerCase().replace(/[-]/g, "");
        var endpoint = hostname + "/subject/com.google.analytics.v1." + subject;
	    model.set('sendHitTask', function(sendModel) {
            try{
                originalSendHitTask(sendModel);
            }catch(e){
                console.log(e);
            }
            navigator.sendBeacon(endpoint, sendModel.get('hitPayload'));
		});
	};
}
```
2. Set a field in the GA Settings variable (in GTM) with field name "customTask" and value {{customTask}}
3. Create version and publish it in GTM
