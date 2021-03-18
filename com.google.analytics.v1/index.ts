import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as fs from 'fs';
import {GoogleAuth} from 'google-auth-library';
import {URL} from 'url';
import {BigQuery} from "@google-cloud/bigquery";
var deepEqual = require('deep-equal')

const config = new pulumi.Config();
const serviceAccountName = config.require("serviceAccountName");

const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const projectId = gcpConfig.require("project");

const artifactRegistryHostname = `${region}-docker.pkg.dev`;
const auth = new GoogleAuth();
const bigquery = new BigQuery();

/*
******** START SETTINGS ********
*/

// VERSTIONS
const collectorVersion = "0.2.0";
const registratorVersion = "0.2.1";
const comGoogleAnalyticsV1EntityTransformerVersion = "0.1.5";

//VARIABLES
const collectorApiKeys = "12345"; //comma separated, ex. "123,456"
const collectorAllowedOrigins = "https://robertsahlin.com"; //comma separated, ex. "https://www.streamprocessor.org"
const bigQueryLocation = "EU";

// SCHEMA REFERENCES (dependent on order)

interface SubjectSchema { 
    subject: string, 
    filename: string, 
    schemaType: string, 
    references?: {
        name: string, 
        subject: string, 
        version: string
    }[]
} 

// add subject schemas for the properties you stream.
let subjectSchemas: SubjectSchema[] = [
   {
        "subject": "com.google.analytics.v1.ua233405661",
        "filename":"/schemas/com.google.analytics.v1.ua233405661.avsc",
        "schemaType":"AVRO",
        "references":[]
    },
];


/*
******** END SETTINGS ********
*/

/*
******** START TOPICS ********
*/
export const deadLetterTopic = new gcp.pubsub.Topic(
    "dead-letter", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "dead-letter",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

export const backupTopic = new gcp.pubsub.Topic(
    "backup", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "backup",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

/*
******** END TOPICS ********
*/

/*
******** START COLLECTOR ********
*/

export const collectedTopic = new gcp.pubsub.Topic(
    "collected", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "collector",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

const collectorService = new gcp.cloudrun.Service(
    "collector-service",
    {
        location: `${region}`,
        template: {
            spec: {
                serviceAccountName: serviceAccountName,
                containers: [
                    {
                        envs: [
                            {
                                name: "TOPIC",
                                value: collectedTopic["name"],
                            },
                            {
                                name: "API_KEYS",
                                value: collectorApiKeys,
                            },
                            {
                                name: "ALLOW_ORIGINS",
                                value: collectorAllowedOrigins,
                            }
                        ],
                        image: `${artifactRegistryHostname}/streamprocessor-org/collector/cloud-run-node:${collectorVersion}`,
                    }
                ],
            },
            metadata: {
                annotations: {
                    "autoscaling.knative.dev/maxScale": "10"
                },
                labels: {
                    program: "infra",
                    stream: "all",
                    component: "collector",
                },
            }
        },
        traffics: [
            {
                latestRevision: true,
                percent: 100,
            }
        ],
    },
    { 
        dependsOn: [
            collectedTopic
        ] 
    }
);

const collectorServiceInvoker = new gcp.cloudrun.IamMember (
    "collector-service-iam-public-invoker", 
    {
        project: collectorService.project,
        location: collectorService.location,
        service: collectorService.name,
        role: "roles/run.invoker",
        member: "allUsers",
    }, 
    { 
        dependsOn: [
            collectorService
        ]
    }
);

/*
******** END COLLECTOR ********
*/


/*
******** START TRANSFORMER ********
*/

export const transformedTopic = new gcp.pubsub.Topic(
    "transformed", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "transformer",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

const comGoogleAnalyticsV1EntityTransformerService = new gcp.cloudrun.Service(
    "transformer-com-google-analytics-v1-entity",
    {
        location: `${region}`,
        template: {
            spec: {
                serviceAccountName: serviceAccountName,
                containers: [
                    {
                        envs: [
                            {
                                name: "TOPIC",
                                value: transformedTopic["name"],
                            }
                        ],
                        image: `${artifactRegistryHostname}/streamprocessor-org/transformer/com-google-analytics-v1:${comGoogleAnalyticsV1EntityTransformerVersion}`,
                    }
                ],
            },
            metadata: {
                annotations: {
                    "autoscaling.knative.dev/maxScale": "10"
                },
                labels: {
                    stream: "com-google-analytics-v1",
                    component: "transformer",
                },
            }
        },
        traffics: [
            {
                latestRevision: true,
                percent: 100,
            }
        ],
    }
);

export const comGoogleAnalyticsV1EntityTransformerServiceUrl = comGoogleAnalyticsV1EntityTransformerService.statuses[0].url;

const comGoogleAnalyticsV1EntityCollectedSubscription = new gcp.pubsub.Subscription(
    "com-google-analytics-v1-entity-transformer",
    {
        topic: collectedTopic["name"],
        ackDeadlineSeconds: 20,
        filter: "hasPrefix(attributes.subject, \"com.google.analytics.v1\")",
        labels: {
            stream: "com-google-analytics-v1",
            component: "transformer",
        },
        pushConfig: {
            pushEndpoint: comGoogleAnalyticsV1EntityTransformerServiceUrl,
            attributes: {
                "x-goog-version": "v1",
            },
            oidcToken: {
                serviceAccountEmail: serviceAccountName
            }
        },
        deadLetterPolicy: {
            deadLetterTopic: deadLetterTopic["id"]
        }
    },
    {
        dependsOn: [
            comGoogleAnalyticsV1EntityTransformerService
        ]
    }
);


/*
******** END TRANSFORMER ********
*/


/*
******** START STREAMER ********
*/

export const streamerTopic = new gcp.pubsub.Topic(
    "streamed", 
    {
        labels: {
            program: "infra",
            stream: "all",
            component: "streamer",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

const transformedSubscription = new gcp.pubsub.Subscription(
    "transformedToStreamer", 
    {
        topic: transformedTopic.name,
        ackDeadlineSeconds: 20,
        labels: {
            program: "infra",
            stream: "all",
            component: "serializer",
        },
        deadLetterPolicy: {
            deadLetterTopic: deadLetterTopic.id,
            maxDeliveryAttempts: 10,
        },
        retryPolicy: {
            minimumBackoff: "10s",
        },
    }, 
    { 
        dependsOn: [ 
            deadLetterTopic
        ] 
    }
);


/*
******** END STREAMER ********
*/


/*
******** START REGISTRATOR ********
*/

// Deploy registrator on cloud run. Modify max instances if needed (default 10).
export const registryService = new gcp.cloudrun.Service(
    "registrator", 
    {
        location: `${region}`,
        template: {
            spec: {
                serviceAccountName: serviceAccountName,
                containers: [
                    {
                        envs: [
                            {
                                name: "COMPATIBILITY",
                                value: "BACKWARD",
                            },
                            {
                                name: "BUCKET",
                                value: projectId + "-schemas",
                            },                            
                        ],
                        image: `${artifactRegistryHostname}/streamprocessor-org/registrator/cloud-run-java:${registratorVersion}`,
                    }
                ],
            },
            metadata: {
                annotations: {
                    "autoscaling.knative.dev/maxScale": "10"
                },
                labels: {
                    program: "infra",
                    stream: "all",
                    component: "registrator",
                },
            }
        },
        traffics: [
            {
                latestRevision: true,
                percent: 100,
            }
        ],
    });

export const registryServiceUrl = registryService.statuses[0].url;

/*
******** END REGISTRATOR ********
*/


async function getServiceResponse(url: any = null, targetAudience: any = null){

    async function request() {
        if (!targetAudience) {
            // Use the request URL hostname as the target audience for requests.
            targetAudience = new URL(url).origin;
        }
        const client = await auth.getIdTokenClient(targetAudience);
        const res = await client.request({url});
        const schema: string = res.data as string;
        return JSON.stringify(JSON.parse(schema));
    }
  
    return request().catch(err => {
      console.error(err.message);
      throw err;
    });
}



// asynchronous function posting schemas to the schema registry
async function postSchemasToRegistry(subjectSchema: SubjectSchema, hostname: string, targetAudience: any = null){
    if (!targetAudience) {
        // Use the request URL hostname as the target audience for requests.
        targetAudience = new URL(hostname).origin;
    }
    try{
        console.log("posting schema for subject: " + subjectSchema.subject);
        const client = await auth.getIdTokenClient(targetAudience);
        
        let body = {
            "schema": JSON.parse(fs.readFileSync(__dirname + subjectSchema.filename, "utf8")),
            "schemaType": subjectSchema?.schemaType,
            "references": subjectSchema?.references
        };

        await client.request(
            {
                url: hostname + "/subjects/" + subjectSchema.subject + "/versions",
                method: 'POST',
                data: body
            }
        );
    }catch(err){
        console.error(err);
        process.exitCode = 1;
    }
}


const comGoogleAnalyticsV1EntityDataset = new gcp.bigquery.Dataset(
    "dataset-com-google-analytics-v1-entity",
    {
        datasetId: "com_google_analytics_v1",
        friendlyName: "com.google.analytics.v1",
        description: "Google Analytics v1 dataset.",
        location: bigQueryLocation,
        labels: {
            stream: "com-google-analytics-v1",
            component: "streamer",
        },
    }
);

async function patchTable(datasetId: string, tableId: string, hostname:string, subject: string){
    // get the subject's latest schema version from schema registry
    let newSchemaString: string  =  await getServiceResponse(`${hostname}/subjects/${subject}/versions/latest/bigqueryschema` , null);
    let table;

    try{
        table = bigquery.dataset(datasetId).table(tableId);
    }catch(err){
        console.info("Table doesn't exist yet, create a new one.");
        return newSchemaString;
    }

    try{
        //const table = bigquery.dataset(datasetId).table(tableId);
        const [metadata] = await table.getMetadata();
        const newSchemaObject = JSON.parse(newSchemaString);
        
        // check for differences between new and old schema and patch if different.
        if(!deepEqual(metadata.schema.fields, newSchemaObject)){
            console.info("Schemas are NOT identical, patching is required.");
            metadata.schema.fields = newSchemaObject;
            const [result] = await table.setMetadata(metadata);
            
            // return schema as it looks like in BigQuery
            return JSON.stringify(result.schema.fields);
        }else{
            console.info("Schemas are identical. No patching required.");
            return JSON.stringify(metadata.schema.fields);
        }
    }catch(err){
        console.error(err);
        process.exitCode = 1;
        return undefined;
        //return newSchemaString;
    }
}

// update schemas in the schema registry and then in the bigquery tables
pulumi.all([registryServiceUrl, comGoogleAnalyticsV1EntityDataset.datasetId])
    .apply(async ([hostname, datasetId]: string[]) => {

        // Post schemas asynchronously but in order
        await subjectSchemas.reduce(async (memo, subjectSchema) => {
            await memo;
            await postSchemasToRegistry(subjectSchema, hostname, null);
            return subjectSchema;
        }, undefined as unknown);

        // Create or update bigquery tables
        await Promise.all(subjectSchemas.map(async (subjectSchema) => {
            const subject = subjectSchema.subject;
            try{
                // use a safe version of subject as bigquery table name
                const tableId = subject.replace(/[-.]/g, "_");
                
                // Patch table if needed and return the bigquery table schema
                let schema: string | undefined = await patchTable(datasetId, tableId, hostname, subject);
            
                // Create bigquery table
                new gcp.bigquery.Table(`table-${subject}`, {
                    datasetId: datasetId,
                    project: projectId,
                    tableId: tableId,
                    deletionProtection: false,
                    timePartitioning: {
                        type: "DAY",
                        field: "timestamp"
                    },
                    labels: {
                        stream: "com-google-analytics-v1",
                        component: "loader",
                    },
                    schema:  schema,
                },
                { 
                    dependsOn: [ 
                        comGoogleAnalyticsV1EntityDataset
                    ],
                });
            
            }catch(err){
                console.error(err);
                process.exitCode = 1;
            }   
        }));
    })

/*
const comGoogleAnalyticsV1Dataflow = new gcp.dataflow.FlexTemplateJob(
    "dataflow-com-google-analytics-v1", 
    {
        containerSpecGcsPath: "gs://streamprocessor-org/dataflow/templates/streamer/generic.json",
        onDelete: "drain",
        region: region,        
        parameters: {
            inputSubscription: transformedSubscription.path,
            registratorHost: registryServiceUrl,
            outputTopic:streamerTopic.id,
            backupTopic:backupTopic.id,
            bigQueryDataset: comGoogleAnalyticsV1EntityDataset.datasetId,
            tempLocation: "gs://streamprocessor-df-demo-staging/tmp",
            numWorkers: 1,
            maxNumWorkers: 1,
            workerMachineType: "n1-standard-1", // n1-standard-2, 
            serviceAccount: serviceAccountName
        },
    }, 
    {
        dependsOn: [ 
            comGoogleAnalyticsV1EntityDataset,
            registryService,
            streamerTopic,
            backupTopic,
            transformedSubscription
        ]
    });*/

