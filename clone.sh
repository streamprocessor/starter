PRIVATE_REPO=https://github.com/${1}/streamprocessor.git

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