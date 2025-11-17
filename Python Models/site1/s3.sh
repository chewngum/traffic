#!/bin/bash

BUCKET_NAME="traffic-labb-frontend"
REGION="us-east-1"
DISTRIBUTION_ID="E1KJP8ZO8C9INC"

echo "🚀 Deploying to S3 and CloudFront..."

# Deploy with proper cache control headers
echo "📤 Uploading HTML files (no cache)..."
aws s3 sync ./public "s3://$BUCKET_NAME/" \
    --exclude "*" --include "*.html" \
    --content-type "text/html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --metadata-directive REPLACE \
    --delete

echo "📤 Uploading CSS files (short cache)..."
aws s3 sync ./public "s3://$BUCKET_NAME/" \
    --exclude "*" --include "*.css" \
    --content-type "text/css" \
    --cache-control "max-age=3600, must-revalidate" \
    --metadata-directive REPLACE \
    --delete

echo "📤 Uploading JS files (short cache)..."
aws s3 sync ./public "s3://$BUCKET_NAME/" \
    --exclude "*" --include "*.js" \
    --content-type "application/javascript" \
    --cache-control "max-age=3600, must-revalidate" \
    --metadata-directive REPLACE \
    --delete

echo "📤 Uploading JSON files..."
aws s3 sync ./public "s3://$BUCKET_NAME/" \
    --exclude "*" --include "*.json" \
    --content-type "application/json" \
    --cache-control "max-age=3600, must-revalidate" \
    --metadata-directive REPLACE \
    --delete

echo "📤 Uploading images (long cache)..."
aws s3 sync ./public "s3://$BUCKET_NAME/" \
    --exclude "*" --include "*.png" --include "*.jpg" --include "*.jpeg" --include "*.svg" --include "*.ico" --include "*.webmanifest" \
    --cache-control "max-age=31536000, immutable" \
    --metadata-directive REPLACE \
    --delete

echo "🔄 Creating CloudFront invalidation..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text)

echo "✅ Invalidation created: $INVALIDATION_ID"
echo "⏳ Waiting for invalidation to complete (this may take 1-2 minutes)..."

# Wait for invalidation to complete
aws cloudfront wait invalidation-completed \
    --distribution-id "$DISTRIBUTION_ID" \
    --id "$INVALIDATION_ID"

echo "✅ Deployment complete!"
echo "🌐 Site: https://thelabb.com.au"
echo "🌐 CloudFront: https://d1f2dwu04m1nfk.cloudfront.net"
echo "🌐 S3: http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"
