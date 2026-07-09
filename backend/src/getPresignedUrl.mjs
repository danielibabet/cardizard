import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3Client = new S3Client({});

export const handler = async (event) => {
  try {
    const bucketName = process.env.UPLOAD_BUCKET_NAME;
    const imageId = `${randomUUID()}.jpg`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: imageId,
      ContentType: "image/jpeg"
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ uploadUrl, imageId })
    };
  } catch (error) {
    console.error("Error generating presigned URL", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Could not generate upload URL" })
    };
  }
};
