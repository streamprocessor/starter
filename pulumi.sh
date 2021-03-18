#!/bin/bash

# exit if a command returns a non-zero exit code and also print the commands and their args as they are executed.
set -e -x

# Download and install required tools.
# pulumi
curl -L https://get.pulumi.com/ | bash
export PATH=$PATH:$HOME/.pulumi/bin

cd $WORKING_DIRECTORY

# Restore npm dependencies.
yarn install

# write credentials to file to be used as application credentials.
echo $GOOGLE_CREDENTIALS > credentials.json
export GOOGLE_APPLICATION_CREDENTIALS=credentials.json
export PULUMI_CONFIG_PASSPHRASE=""

# Log in to stack backend.
pulumi login --cloud-url gs://${GOOGLE_PROJECT}-state

# Create stack if not exists.
pulumi stack init ${STACK} --secrets-provider="gcpkms://projects/${GOOGLE_PROJECT}/locations/global/keyRings/${GOOGLE_KEY_RING}/cryptoKeys/${GOOGLE_CRYPTO_KEY}" || { echo "stack already exists, continue with that stack."; }

# Select the appropriate stack.
pulumi stack select ${STACK}

# set stack configurations
pulumi config set gcp:project ${GOOGLE_PROJECT} --non-interactive 
pulumi config set gcp:region ${GOOGLE_REGION} --non-interactive 
pulumi config set gcp:zone ${GOOGLE_ZONE} --non-interactive 
pulumi config set serviceAccountName streamprocessor@${GOOGLE_PROJECT}.iam.gserviceaccount.com --non-interactive


#pulumi stack export | pulumi stack import
#pulumi refresh --yes
#pulumi stack graph tmp.gv
#cat tmp.gv
#pulumi stack output --json
#pulumi logs -f

case $BUILD_TYPE in
  PullRequest)
      pulumi preview
    ;;
  *)
      pulumi up --yes
    ;;
esac