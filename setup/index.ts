import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const projectId = gcpConfig.require("project");

/*
* Create a GCP Storage Bucket and export the DNS name
*/
const stateBucket = new gcp.storage.Bucket(
    projectId + "-state",
    {
        name: projectId + "-state",
        location: gcpConfig.require("region")
    },
    {
        //import: projectId + "-state"
    }
);
export const stateBucketName = stateBucket.url;

/*
* Enable API:s
*/
const secretManagerApi = new gcp.projects.Service(
    "secret-manager-api", 
    {
        service: "secretmanager.googleapis.com"
    }
);

const iamApi = new gcp.projects.Service(
    "iam-api", 
    {
        service: "iam.googleapis.com"
    }
);

const cloudBuildApi = new gcp.projects.Service(
    "cloud-build-api", 
    {
        service: "cloudbuild.googleapis.com"
    }
);

new gcp.projects.Service(
    "cloud-run-api",
    {
        service: "run.googleapis.com"
    }
);

new gcp.projects.Service(
    "cloudfunctions-api", 
    {
        service: "cloudfunctions.googleapis.com"
    }
);

const cloudKmsApi = new gcp.projects.Service(
    "cloud-kms-api", 
    {
        service: "cloudkms.googleapis.com"
    }
);

new gcp.projects.Service(
    "dataflow-api", 
    {
        service: "dataflow.googleapis.com"
    }
);

const pubsubApi = new gcp.projects.Service(
    "pubsub-api", 
    {
        service: "pubsub.googleapis.com"
    }
);

new gcp.projects.Service(
    "enable-cloud-resource-manager", 
    {
        service: "cloudresourcemanager.googleapis.com"
    }
);

/*
* Iam members
*/

const cloudBuildIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then((projectResult: { number: string; }) => {return "serviceAccount:"+ projectResult.number + "@cloudbuild.gserviceaccount.com"});

const cloudBuildAgentIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then((projectResult: { number: string; }) => {return "serviceAccount:service-"+ projectResult.number + "@gcp-sa-cloudbuild.iam.gserviceaccount.com"});

const pubsubServiceAgentIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then((projectResult: { number: string; }) => {return "serviceAccount:service-"+ projectResult.number + "@gcp-sa-pubsub.iam.gserviceaccount.com"});

const computeEngineIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then((projectResult: { number: string; }) => {return "serviceAccount:"+ projectResult.number + "-compute@developer.gserviceaccount.com"});

const streamProcessorServiceAccount = new gcp.serviceaccount.Account(
    "streamprocessor-service-account",
    {
        accountId: "streamprocessor",
        description:"The service account used by StreamProcessor services",
        displayName:"StreamProcessor service account"
    },
    {
        dependsOn: [
            iamApi
        ],
        //import:"streamprocessor@" + projectId + ".iam.gserviceaccount.com"
    }
);

export const streamProcessorServiceAccountEmail = streamProcessorServiceAccount.email;

/*
* Bind roles on project level
*/

// IAM

new gcp.projects.IAMBinding(
    "project-iam-binding-iam-service-account-user", 
    {
        role: "roles/iam.serviceAccountUser",
        project: projectId,
        members: [
            cloudBuildIamMember,
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    },
    {
        dependsOn: [
            cloudBuildApi,
            iamApi
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-iam-cloud-build-builder", 
    {
        role: "roles/cloudbuild.builds.builder",
        project: projectId,
        members: [
            cloudBuildIamMember,
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    },
    {
        dependsOn: [
            cloudBuildApi,
            iamApi
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-cloud-kms-crypto-key-encrypter-decrypter", 
    {
        role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
        project: projectId,
        members: [
            cloudBuildIamMember, 
            cloudBuildAgentIamMember,
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    },
    {
        dependsOn:[
            cloudBuildApi,
            cloudKmsApi,
            iamApi
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-secretmanager-secret-accessor", 
    {
        role: "roles/secretmanager.secretAccessor",
        project: projectId,
        members: [
            cloudBuildIamMember
        ]
    },
    {
        dependsOn: [
            cloudBuildApi,
            iamApi
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-storage-admin", 
    {
        role: "roles/storage.admin",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);


new gcp.projects.IAMBinding(
    "project-iam-binding-cloudfunctions-admin", 
    {    
        role: "roles/cloudfunctions.admin",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);
     
new gcp.projects.IAMBinding(
    "project-iam-binding-pubsub-editor", 
    {
        role: "roles/pubsub.editor",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);    
    
new gcp.projects.IAMBinding(
    "project-iam-binding-bigquery-data-editor", 
    {
        role: "roles/bigquery.dataEditor",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-iam-service-account-token-creator", 
    {
        role: "roles/iam.serviceAccountTokenCreator",
        project: projectId,
        members: [
            pubsubServiceAgentIamMember
        ]
    },
    {
        dependsOn: [
            pubsubApi
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-dataflow-admin", 
    {
        role: "roles/dataflow.admin",
        project: projectId,
        members: [
            cloudBuildIamMember,
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-dataflow-worker", 
    {
        role: "roles/dataflow.worker",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-cloudfunctions-developer", 
    {
        role: "roles/cloudfunctions.developer",
        project: projectId,
        members: [
            cloudBuildIamMember
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-run-admin", 
    {
        role: "roles/run.admin",
        project: projectId,
        members: [
            cloudBuildIamMember, 
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);

new gcp.projects.IAMBinding(
    "project-iam-binding-run-artifactregistry-reader", 
    {
        role: "roles/artifactregistry.reader",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);

// SECURITY

const streamProcessorServiceAccountKey = new gcp.serviceaccount.Key(
    "streamprocessor-service-account-key", 
    {
        serviceAccountId: streamProcessorServiceAccountEmail
    }
);

const streamProcessorServiceAccountSecret = new gcp.secretmanager.Secret(
    "streamprocessor-service-account-secret", 
    {
        secretId: "pulumi-credentials",
        replication: {
            userManaged: {
                replicas:[
                    {location: "us-central1"}
                ]
            }
        }
    },
    {
        dependsOn:[
            secretManagerApi
        ],
        //import: "pulumi-credentials"
    }
);

new gcp.secretmanager.SecretVersion(
    "streamprocessor-service-account-secret-version",
    {
        secret: streamProcessorServiceAccountSecret.name,
        secretData: streamProcessorServiceAccountKey.privateKey.apply(
            (privateKey: any) => Buffer.from(privateKey, 'base64').toString('ascii')
        )
    },
    {
        dependsOn:[
            secretManagerApi, 
            streamProcessorServiceAccountSecret
        ],
    }
);


// kms encryption
const streamProcessorKmsKeyRing = new gcp.kms.KeyRing(
    "streamprocessor-kms-key-ring", 
    {
        name: "streamprocessor",
        location: "global",
        project: projectId
    }, 
    {
        dependsOn:[
            cloudKmsApi
        ],
        //import: "projects/"+ projectId + "/locations/global/keyRings/streamprocessor"
    }
);

new gcp.kms.CryptoKey(
    "streamprocessor-kms-crypto-key", 
    {
        name: "pulumi",
        keyRing: streamProcessorKmsKeyRing.id,
    }, 
    {
        dependsOn:[
            streamProcessorKmsKeyRing
        ],
        //import:"projects/" + projectId + "/locations/global/keyRings/streamprocessor/cryptoKeys/pulumi"
    }
);
