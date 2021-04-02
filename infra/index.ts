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
const collectorVersion = "0.2.0";

// VARIABLES
const bigQueryLocation = "EU"; // <-- set region for BigQuery Dataset
const collectorApiKeys = "12345"; //comma separated, ex. "123,456"
const collectorAllowedOrigins = "https://myawesomesite.com"; //comma separated, ex. "https://www.streamprocessor.org"

/*
********    END SETTINGS ********
*/

/*
* START BUCKETS
*/

const schemasBucket = new gcp.storage.Bucket(
    projectId + "-schemas",
    {
        name: projectId + "-schemas",
        location: gcpConfig.require("region")
    },
    {
        //import: projectId + "-schemas"
    }
);
export const schemasBucketName = schemasBucket.url;

const stagingBucket = new gcp.storage.Bucket(
    projectId + "-staging",
    {
        name: projectId + "-staging",
        location: gcpConfig.require("region")
    },
    {
        //import: projectId + "-staging"
    }
);
export const stagingBucketName = stagingBucket.url;

/*
******** START DEADLETTERS ********
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



/*
******** START BACKUP ********
*/

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

const backupSubscription = new gcp.pubsub.Subscription(
    "backupSubscription", 
    {
        topic: backupTopic.name,
        ackDeadlineSeconds: 20,
        labels: {
            program: "infra",
            stream: "all",
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

export const collectorService: gcp.cloudrun.Service = new gcp.cloudrun.Service(
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

new gcp.cloudrun.IamMember (
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


/*
******** START BIGQUERY ********
*/
// Placeholder dataset for tables containing subjects, schemas, stacks and backups (TODO).
const streamProcessorDataset = new gcp.bigquery.Dataset(
    "dataset-streamprocessor",
    {
        datasetId: "streamprocessor",
        friendlyName: "streamprocessor",
        description: "StreamProcessor admin dataset.",
        location: bigQueryLocation,
        labels: {
            stream: "all",
            component: "infra",
        },
    }
);
