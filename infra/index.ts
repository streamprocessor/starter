import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const projectId = gcpConfig.require("project");

/*
* Create a GCP Storage Bucket and export the DNS name
*/

const schemasBucket = new gcp.storage.Bucket(
    projectId + "-schemas",
    {
        name: projectId + "-schemas",
        location: gcpConfig.require("region")
    }
);
export const schemasBucketName = schemasBucket.url;

const stagingBucket = new gcp.storage.Bucket(
    projectId + "-staging",
    {
        name: projectId + "-staging",
        location: gcpConfig.require("region")
    }
);
export const stagingBucketName = stagingBucket.url;



/*
* Iam members
*/

const cloudBuildIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then(projectResult => {return "serviceAccount:"+ projectResult.number + "@cloudbuild.gserviceaccount.com"});

const cloudBuildAgentIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then(projectResult => {return "serviceAccount:service-"+ projectResult.number + "@gcp-sa-cloudbuild.iam.gserviceaccount.com"});

const pubsubServiceAgentIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then(projectResult => {return "serviceAccount:service-"+ projectResult.number + "@gcp-sa-pubsub.iam.gserviceaccount.com"});

const computeEngineIamMember = gcp.organizations
    .getProject({projectId: projectId})
    .then(projectResult => {return "serviceAccount:"+ projectResult.number + "-compute@developer.gserviceaccount.com"});

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
);*/

const projectIamBindingDataflowAdmin = new gcp.projects.IAMBinding(
    "projectIamBindingDataflowAdmin", 
    {
        role: "roles/dataflow.admin",
        project: projectId,
        members: [
            cloudBuildIamMember
        ]
    }
);

const projectIamBindingCloudFunctionsDeveloper = new gcp.projects.IAMBinding(
    "projectIamBindingCloudFunctionsDeveloper", 
    {
        role: "roles/cloudfunctions.developer",
        project: projectId,
        members: [
            cloudBuildIamMember
        ]
    }
);

const projectIamBindingRunAdmin = new gcp.projects.IAMBinding(
    "projectIamBindingRunAdmin", 
    {
        role: "roles/run.admin",
        project: projectId,
        members: [
            cloudBuildIamMember, 
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
        ]
    }
);

const projectIamBindingIamServiceAccountUser = new gcp.projects.IAMBinding(
    "projectIamBindingIamServiceAccountUser", 
    {
        role: "roles/iam.serviceAccountUser",
        project: projectId,
        members: [
            cloudBuildIamMember,
            pulumi.interpolate`serviceAccount:${streamProcessorServiceAccountEmail}`
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
    }
);

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
    }
);

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
    }
);

const streamProcessorServiceAccountSecretVersion = new gcp.secretmanager.SecretVersion(
    "streamProcessorServiceAccountSecretVersion",
    {
        secret: streamProcessorServiceAccountSecret.name,
        secretData: streamProcessorServiceAccountKey.privateKey.apply(
            privateKey => Buffer.from(privateKey, 'base64').toString('ascii')
        )
    },
    {
        dependsOn:[ 
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