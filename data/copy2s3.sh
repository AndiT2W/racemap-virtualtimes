echo "copy files to s3 bucket"

for file in *.json; do
  echo "$file"
  aws s3api put-object --bucket t2w-racemap-bucket --key data/$file --body /home/bitnami/racemapvirtualtimes/data/$file
done
