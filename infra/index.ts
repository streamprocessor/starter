// IMPORT
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

// PULUMI CONFIG
const config = new pulumi.Config();
const serviceAccountName = config.require("serviceAccountName");
const gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const projectId = gcpConfig.require("project");


/*
******** START SETTINGS ********
*/

// ARTIFACTS
const artifactRegistryHostname = `${region}-docker.pkg.dev`;
const registratorVersion = "0.2.1";

// VARIABLES
const bigQueryLocation = "EU"; // <-- set region for BigQuery Dataset


/*
********    END SETTINGS ********
*/


/*
******** START BUCKETS ********
*/

export const schemasBucket = new gcp.storage.Bucket(
    projectId + "-schemas",
    {
        name: projectId + "-schemas",
        location: gcpConfig.require("region")
    },
    {
        //import: projectId + "-schemas"
    }
);
//export const schemasBucketName = schemasBucket.url;

export const stagingBucket = new gcp.storage.Bucket(
    projectId + "-staging",
    {
        name: projectId + "-staging",
        location: gcpConfig.require("region")
    },
    {
        //import: projectId + "-staging"
    }
);
//export const stagingBucketName = stagingBucket.url;

/*
******** START DEADLETTERS ********
*/
export const deadLetterTopic = new gcp.pubsub.Topic(
    "deadLetterTopic", 
    {
        labels: {
            stream: "infra",
            component: "deadLetter",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);



/*
******** START BACKUP ********
*/

export const backupTopic = new gcp.pubsub.Topic(
    "backupTopic", 
    {
        labels: {
            stream: "infra",
            component: "backup",
        },
        messageStoragePolicy: {
            allowedPersistenceRegions: [
                gcpConfig.require("region")
            ]
        }
    }
);

const backupSubscription = new gcp.pubsub.Subscription(
    "backupSubscription", 
    {
        topic: backupTopic.name,
        ackDeadlineSeconds: 20,
        labels: {
            stream: "infra",
            component: "backup",
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
******** END BACKUP ********
*/


/*
******** START REGISTRATOR ********
*/

// Deploy registrator on cloud run. Modify max instances if needed (default 10).
export const registrator = new gcp.cloudrun.Service(
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
                    stream: "infra",
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

//export const registratorUrl = registrator.statuses[0].url;

/*
******** END REGISTRATOR ********
*/


/*
******** START BIGQUERY ********
*/
// Placeholder dataset for tables containing subjects, schemas, stacks and backups (TODO).
const infraBigQueryDataset = new gcp.bigquery.Dataset(
    "infraBigQueryDataset",
    {
        datasetId: "infra",
        friendlyName: "infra",
        description: "StreamProcessor infra dataset.",
        location: bigQueryLocation,
        labels: {
            stream: "infra",
            component: "sink",
        },
    }
);
