# StreamProcessor starter kit
This repository contains everything you need to get started with StreamProcessor. The GitOps mode (preferred) of StreamProcessor requires some basic knowledge in git (clone, commit, push, pull, checkout) but that will give you versioning, reproducability, collaboration, and much more.

If you find any bugs or issues in the starter kit, please <a href="https://github.com/streamprocessor/starter/issues" target="_blank">report the bug/issue here.</a>. There is also a support channel in the StreamProcessor slack community.

[Video guides covering the steps below](https://www.youtube.com/playlist?list=PL9VRkI0zkbdWKkVV-M8fysjdGytjP5vdb).

---

## 1. Private copy of the starter repository
To work with StreamProcessor you need a [Google Cloud Platform account](https://cloud.google.com/), a [GitHub account](https://docs.github.com/en/github/getting-started-with-github/signing-up-for-a-new-github-account) and a [GitHub personal access token](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token). Avoid authenticating everytime you interact with your private repo by [caching your GitHub credentials](https://docs.github.com/en/github/getting-started-with-github/caching-your-github-credentials-in-git) in [google cloud shell](https://shell.cloud.google.com) (you can change default timeout of 1 hour to something longer).

### 1.1 Initial copy
Follow the steps to get a private copy of the public starter repository, while being able to sync changes from the original starter repository.

1. Create your own private streamprocessor <a href="https://docs.github.com/en/articles/creating-a-new-repository" target="_blank">repository on GitHub</a>, i.e. something like https://github.com/[USER]/streamprocessor.git
2. <a href="https://shell.cloud.google.com" target="_blank">Open cloud shell</a> and run:

```bash
# Your private git repo URL https://github.com/[USER]/streamprocessor.git
PRIVATE_REPO=

# Clone the public starter repository
git clone --bare https://github.com/streamprocessor/starter.git

# Mirror-push to the new repository.
cd starter.git
git push --mirror ${PRIVATE_REPO}

# Remove the temporary local repository you created earlier.
cd ..
rm -rf starter.git

# Clone the private repo so you can work on it.
git clone ${PRIVATE_REPO}
cd streamprocessor

# Add a remote to the public starter repo to pull changes if needed.
git remote add public https://github.com/streamprocessor/starter.git
```
Now you should have a local and remote repository containing the latest version of the starter template code.

### 1.2. Update with the latest changes in the public starter repository
If you at any time want to update your private repo with the latest changes in the public starter repository.

```bash
# first make sure working directory is streamprocessor (cd streamprocessor)
git pull public main # Creates a merge commit
git push origin main
```

---

## 2 Set up Pulumi and enable API:s
This step prepares your project by enabling API:s, get access to StreamProcessor artifacts and connect Cloud Build to your private GitHub repository.
[Setup instructions](/setup/README.md)

---

## 3 Shared infrastructure
This step creates infrastructure that is shared across the pipelines, i.e. staging buckets, schema registry, etc.
[Setup instructions](/infra/README.md)

---

## 4. Pipelines
Here you find instructions for setting up different pipelines. Common for all pipelines are the following files:

* README.md - Instructions to set up the pipeline
* schemas/*.avsc - One or multiple Avro schema files used to serialize the messages.
* cloud.pulumi.yaml - Cloud Build configuration file to enable CI/CD
* index.ts - The program (typescript) declaring your infrastructure stack
* package.json - The program dependencies
* Pulumi.yaml - The project file containing program settings
* tsconfig.json - Allows your to set additional TypeScript compiler options (optional)


### 4.1 com.google.analytics.v1 (Universal Analytics)
This is a streaming pipeline for Google Analytics data (universal analytics).
[Setup instructions](/com.google.analytics.v1/README.md)


---

## 6 Tips & Trix

### 6.1 Caching GitHub personal access token in Cloud Shell
1. [First create a personal access token](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token).
2. Avoid authenticating everytime you interact with your private repo by [caching your GitHub credentials](https://docs.github.com/en/github/getting-started-with-github/caching-your-github-credentials-in-git)

### 6.2 Syntax highlighting AVRO files in Cloud Shell Editor
If using cloud shell ide, add the following file association to make it easier (suntax highlighting) to work with avro files (.avsc).

```json
"files.associations": {
    "*.avsc": "json"
}
```
