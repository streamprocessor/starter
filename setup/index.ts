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
    "secretManagerApi", 
    {
        service: "secretmanager.googleapis.com"
    }
);

const cloudBuildApi = new gcp.projects.Service(
    "cloudBuildApi", 
    {
        service: "cloudbuild.googleapis.com"
    }
);

new gcp.projects.Service(
    "cloudRunApi",
    {
        service: "run.googleapis.com"
    }
);

new gcp.projects.Service(
    "cloudfunctionsApi", 
    {
        service: "cloudfunctions.googleapis.com"
    }
);

const cloudKmsApi = new gcp.projects.Service(
    "cloudKmsApi", 
    {
        service: "cloudkms.googleapis.com"
    }
);

new gcp.projects.Service(
    "dataflowApi", 
    {
        service: "dataflow.googleapis.com"
    }
);

new gcp.projects.Service(
    "pubsubApi", 
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

const streamProcessorServiceAccount = new gcp.serviceaccount.Account(
    "streamProcessorServiceAccount",
    {
        accountId: "streamprocessor",
        description:"The service account used by StreamProcessor services",
        displayName:"StreamProcessor service account"
    },
    {
        //import:"streamprocessor"
    }
);

export const streamProcessorServiceAccountEmail = streamProcessorServiceAccount.email;

/*
* Bind roles on project level
*/

/*
const projectIamBindingEditor = new gcp.projects.IAMBinding(
    "projectIamBindingEditor", 
    {
        role: "roles/editor",
        project: projectId,
        members: [
            cloudBuildIamMember
        ]
    },
    {
        dependsOn: [
            cloudBuildApi
        ]
    }
);

*/

const projectIamBindingIamServiceAccountUser = new gcp.projects.IAMBinding(
    "projectIamBindingIamServiceAccountUser", 
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
            cloudBuildApi
        ]
    }
);

const projectIamBindingCloudkmsCryptoKeyEncrypterDecrypter = new gcp.projects.IAMBinding(
    "projectIamBindingCloudkmsCryptoKeyEncrypterDecrypter", 
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
            cloudKmsApi
        ]
    }
);

const projectIamBindingSecretmanagerSecretAccessor = new gcp.projects.IAMBinding(
    "projectIamBindingSecretmanagerSecretAccessor", 
    {
        role: "roles/secretmanager.secretAccessor",
        project: projectId,
        members: [
            cloudBuildIamMember
        ]
    },
    {
        dependsOn: [
            cloudBuildApi
        ]
    }
);

/*
const projectIamBindingCloudfunctionsAdmin = new gcp.projects.IAMBinding(
    "projectIamBindingCloudfunctionsAdmin", 
    {    
        role: "roles/cloudfunctions.admin",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);
     
const projectIamBindingPubsubEditor = new gcp.projects.IAMBinding(
    "projectIamBindingPubsubEditor", 
    {
        role: "roles/pubsub.editor",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);    

const projectIamBindingStorageObjectAdmin = new gcp.projects.IAMBinding(
    "projectIamBindingStorageObjectAdmin", 
    {
        role: "roles/storage.objectAdmin",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);
    
const projectIamBindingBigqueryDataEditor = new gcp.projects.IAMBinding(
    "projectIamBindingBigqueryDataEditor", 
    {
        role: "roles/bigquery.dataEditor",
        project: projectId,
        members: [
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);

const projectIamBindingIamServiceAccountTokenCreator = new gcp.projects.IAMBinding(
    "projectIamBindingIamServiceAccountTokenCreator", 
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
);*/

const streamProcessorServiceAccountKey = new gcp.serviceaccount.Key(
    "streamProcessorServiceAccountKey", 
    {
        serviceAccountId: streamProcessorServiceAccountEmail
    }
);

const streamProcessorServiceAccountSecret = new gcp.secretmanager.Secret(
    "streamProcessorServiceAccountSecret", 
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
        ]
    }
);

const streamProcessorServiceAccountSecretVersion = new gcp.secretmanager.SecretVersion(
    "streamProcessorServiceAccountSecretVersion",
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
        ]
    }
);


// kms encryption
const streamProcessorKmsKeyRing = new gcp.kms.KeyRing(
    "streamProcessorKmsKeyRing", 
    {
        name: "streamprocessor",
        location: "global",
        project: projectId
    }, 
    {
        dependsOn:[
            cloudKmsApi
        ],
        //import: "projects/streamprocessor-starter-demo/locations/global/keyRings/streamprocessor"
    }
);

const streamProcessorKmsCryptoKey = new gcp.kms.CryptoKey(
    "streamProcessorKmsCryptoKey", 
    {
        name: "pulumi",
        keyRing: streamProcessorKmsKeyRing.id,
    }, 
    {
        dependsOn:[
            streamProcessorKmsKeyRing
        ]
    }
);