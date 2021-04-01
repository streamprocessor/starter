// IMPORT
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as StreamProcessor from "../StreamProcessorHelpers"

// INFRA STACK
const infra = new pulumi.StackReference("infra");
const collectedTopic = infra.requireOutput("collectedTopic").apply((topic: gcp.pubsub.Topic ) => {return topic.id});
const deadLetterTopic = infra.requireOutput("deadLetterTopic").apply((topic: gcp.pubsub.Topic ) => {return topic.id});
const registryServiceUrl = infra.requireOutput("registryServiceUrl");
const backupTopic = infra.requireOutput("backupTopic").apply((topic: gcp.pubsub.Topic ) => {return topic.id});;
const stagingBucketName = infra.requireOutput("stagingBucketName");

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
const comGoogleAnalyticsV1EntityTransformerVersion = "0.1.5"; // <-- updates transformer version

//VARIABLES
const bigQueryLocation = "EU"; // <-- set region for BigQuery Dataset

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
        topic: collectedTopic,
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
            deadLetterTopic: deadLetterTopic
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

const comGoogleAnalyticsV1DeadLetterSubscription = new gcp.pubsub.Subscription(
    "comGoogleAnalyticsV1DeadLetterSubscription", 
    {
        topic: deadLetterTopic,
        ackDeadlineSeconds: 20,
        retainAckedMessages: true,
        filter: "hasPrefix(attributes.subject, \"com.google.analytics.v1\")",
        labels: {
            program: "infra",
            stream: "all",
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
            outputTopic: streamerTopic.id,
            backupTopic: backupTopic,
            bigQueryDataset: comGoogleAnalyticsV1EntityDataset.datasetId,
            tempLocation: stagingBucketName,
            numWorkers: 1,
            maxNumWorkers: 1,
            workerMachineType: "n1-standard-1", // n1-standard-2, 
            serviceAccount: serviceAccountName
        },
    }, 
    {
        dependsOn: [ 
            comGoogleAnalyticsV1EntityDataset,
            //registryService,
            streamerTopic,
            //backupTopic,
            transformedSubscription
        ]
    });
*/

/*
******** END STREAMER ********
*/


/*
******** START BIGQUERY TABLES ********
*/

// update schemas in the schema registry and then in the bigquery tables
pulumi.all([registryServiceUrl, comGoogleAnalyticsV1EntityDataset.datasetId])
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
                        comGoogleAnalyticsV1EntityDataset
                    ],
                });
            
            }catch(err){
                console.error(err);
                process.exitCode = 1;
            }   
        }));
    });

/*
******** END BIGQUERY TABLES ********
*/
