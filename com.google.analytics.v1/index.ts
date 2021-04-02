// IMPORT
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as StreamProcessor from "../StreamProcessorHelpers"

// INFRA STACK
const infra = new pulumi.StackReference("infra");
const deadLetterTopic = infra.requireOutput("deadLetterTopic").apply((topic: gcp.pubsub.Topic ) => {return topic.id});
const registratorUrl = infra.requireOutput("registrator").apply((service: gcp.cloudrun.Service) => {return service.statuses[0].url});
const backupTopic = infra.requireOutput("backupTopic").apply((topic: gcp.pubsub.Topic ) => {return topic.id});
const stagingBucketName = infra.requireOutput("stagingBucket").apply((bucket: gcp.storage.Bucket) => {return bucket.url + "/tmp"});

// PULUMI CONFIG
const config = new pulumi.Config();
const serviceAccountName = config.require("serviceAccountName");
const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const projectId = gcpConfig.require("project");


/*
******** START SETTINGS ********
* In most cases you only have to change values in SETTINGS section.
*/

// ARTIFACTS
const artifactRegistryHostname = `${region}-docker.pkg.dev`;
const comGoogleAnalyticsV1TransformerVersion = "0.1.5"; // <-- updates transformer version
const collectorVersion = "0.2.0"; // <-- updates collector version

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


/*
******** END SETTINGS ********
*/

/*
******** START COLLECTOR ********
*/

export const comGoogleAnalyticsV1CollectedTopic = new gcp.pubsub.Topic(
    "com-google-analytics-v1-collected-topic", 
    {
        labels: {
            stream: "com-google-analytics-v1",
            component: "collector",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

export const comGoogleAnalyticsV1CollectorService = new gcp.cloudrun.Service(
    "com-google-analytics-v1-collector-service",
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
                                value: comGoogleAnalyticsV1CollectedTopic["name"],
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
                    stream: "com-google-analytics-v1",
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
            comGoogleAnalyticsV1CollectedTopic
        ] 
    }
);

new gcp.cloudrun.IamMember (
    "com-google-analytics-v1-collector-service-iam-public-invoker", 
    {
        project: comGoogleAnalyticsV1CollectorService.project,
        location: comGoogleAnalyticsV1CollectorService.location,
        service: comGoogleAnalyticsV1CollectorService.name,
        role: "roles/run.invoker",
        member: "allUsers",
    }, 
    { 
        dependsOn: [
            comGoogleAnalyticsV1CollectorService
        ]
    }
);

/*
******** END COLLECTOR ********
*/


/*
******** START TRANSFORMER ********
*/

export const comGoogleAnalyticsV1TransformedTopic = new gcp.pubsub.Topic(
    "com-google-analytics-v1-transformed-topic", 
    {
        labels: {
            stream: "com-google-analytics-v1",
            component: "transformer",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

const comGoogleAnalyticsV1TransformerService = new gcp.cloudrun.Service(
    "com-google-analytics-v1-transformer-service",
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
                                value: comGoogleAnalyticsV1TransformedTopic["name"],
                            }
                        ],
                        image: `${artifactRegistryHostname}/streamprocessor-org/transformer/com-google-analytics-v1:${comGoogleAnalyticsV1TransformerVersion}`,
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

//export const comGoogleAnalyticsV1TransformerServiceUrl = comGoogleAnalyticsV1TransformerService.statuses[0].url;

const comGoogleAnalyticsV1CollectedSubscription = new gcp.pubsub.Subscription(
    "com-google-analytics-v1-collected-subscription",
    {
        topic: comGoogleAnalyticsV1CollectedTopic.id,
        ackDeadlineSeconds: 20,
        filter: "hasPrefix(attributes.subject, \"com.google.analytics.v1\")",
        labels: {
            stream: "com-google-analytics-v1",
            component: "transformer",
        },
        pushConfig: {
            pushEndpoint: comGoogleAnalyticsV1TransformerService.statuses[0].url,//comGoogleAnalyticsV1TransformerServiceUrl,
            attributes: {
                "x-goog-version": "v1",
            },
            oidcToken: {
                serviceAccountEmail: serviceAccountName
            }
        },
        deadLetterPolicy: {
            deadLetterTopic: deadLetterTopic
        }
    },
    {
        dependsOn: [
            comGoogleAnalyticsV1TransformerService
        ]
    }
);


/*
******** END TRANSFORMER ********
*/

const comGoogleAnalyticsV1DeadLetterSubscription = new gcp.pubsub.Subscription(
    "com-google-analytics-v1-deadLetter-subscription", 
    {
        topic: deadLetterTopic,
        ackDeadlineSeconds: 20,
        retainAckedMessages: true,
        filter: "hasPrefix(attributes.subject, \"com.google.analytics.v1\")",
        labels: {
            stream: "com-google-analytics-v1",
            component: "backup",
        },
        retryPolicy: {
            minimumBackoff: "10s",
        },
    }, 
    { 
        dependsOn: [ 
            //deadLetterTopic
        ] 
    }
);



/*
******** START STREAMER ********
*/

export const comGoogleAnalyticsV1StreamerTopic = new gcp.pubsub.Topic(
    "com-google-analytics-v1-streamer-topic", 
    {
        labels: {
            stream: "com-google-analytics-v1",
            component: "streamer",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

const comGoogleAnalyticsV1TransformedSubscription = new gcp.pubsub.Subscription(
    "com-google-analytics-v1-transformed-subscription", 
    {
        topic: comGoogleAnalyticsV1TransformedTopic.name,
        ackDeadlineSeconds: 20,
        labels: {
            stream: "com-google-analytics-v1",
            component: "streamer",
        },
        deadLetterPolicy: {
            deadLetterTopic: deadLetterTopic,
            maxDeliveryAttempts: 10,
        },
        retryPolicy: {
            minimumBackoff: "10s",
        },
    }, 
    { 
        dependsOn: [ 
            //deadLetterTopic
        ] 
    }
);

const comGoogleAnalyticsV1BigQueryDataset = new gcp.bigquery.Dataset(
    "com-google-analytics-v1-bigquery-dataset",
    {
        datasetId: "com_google_analytics_v1",
        friendlyName: "com.google.analytics.v1",
        description: "Google Analytics v1 dataset.",
        location: bigQueryLocation,
        labels: {
            stream: "com-google-analytics-v1",
            component: "sink",
        },
    }
);


const comGoogleAnalyticsV1Dataflow = new gcp.dataflow.FlexTemplateJob(
    "com-google-analytics-v1-dataflow", 
    {
        containerSpecGcsPath: "gs://streamprocessor-org/dataflow/templates/streamer/generic.json",
        onDelete: "drain",
        region: region,        
        parameters: {
            inputSubscription: comGoogleAnalyticsV1TransformedSubscription.id,
            registratorHost: registratorUrl,
            outputTopic: comGoogleAnalyticsV1StreamerTopic.id,
            backupTopic: backupTopic,
            bigQueryDataset: comGoogleAnalyticsV1BigQueryDataset.datasetId,
            tempLocation: stagingBucketName,
            numWorkers: 1,
            maxNumWorkers: 1,
            workerMachineType: "n1-standard-1", // n1-standard-2, 
            serviceAccount: serviceAccountName
        },
        labels: {
            stream: "com-google-analytics-v1",
            component: "streamer",
            cachebuster: Date.now().toString()
        },
    }, 
    {
        dependsOn: [ 
            comGoogleAnalyticsV1BigQueryDataset,
            comGoogleAnalyticsV1StreamerTopic,
            comGoogleAnalyticsV1TransformedSubscription
        ]
    });


/*
******** END STREAMER ********
*/


/*
******** START BIGQUERY TABLES ********
*/

// update schemas in the schema registry and then in the bigquery tables
pulumi.all([registratorUrl, comGoogleAnalyticsV1BigQueryDataset.datasetId])
    .apply(async ([hostname, datasetId]: string[]) => {

        // Post schemas asynchronously but in order
        await subjectSchemas.reduce(async (memo, subjectSchema) => {
            await memo;
            await StreamProcessor.postSchemasToRegistry(subjectSchema, hostname, null);
            return subjectSchema;
        }, undefined as unknown);

        // Create or update bigquery tables
        await Promise.all(subjectSchemas.map(async (subjectSchema) => {
            const subject = subjectSchema.subject;
            try{
                // use a safe version of subject as bigquery table name
                const tableId = subject.replace(/[-.]/g, "_");
                
                // Patch table if needed and return the bigquery table schema
                let schema: string | undefined = await StreamProcessor.patchTable(datasetId, tableId, hostname, subject);
            
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
                        comGoogleAnalyticsV1BigQueryDataset
                    ],
                });
            
            }catch(err){
                console.error(err.message);
                process.exitCode = 1;
            }   
        }));
    });

/*
******** END BIGQUERY TABLES ********
*/
