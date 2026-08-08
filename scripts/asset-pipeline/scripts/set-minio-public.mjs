import { S3Client, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
const env = fs.readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
const g = (k) => (env.match(new RegExp('^'+k+'=(.+)$','m'))||[])[1]?.trim();
const client = new S3Client({ endpoint: `http://${g('MINIO_ENDPOINT')||'localhost'}:${g('MINIO_PORT')||'9000'}`, region:'us-east-1', credentials:{accessKeyId:g('MINIO_ACCESS_KEY')||'minioadmin', secretAccessKey:g('MINIO_SECRET_KEY')||'minioadmin'}, forcePathStyle:true });
const policy = { Version:'2012-10-17', Statement:[{ Effect:'Allow', Principal:{AWS:['*']}, Action:['s3:GetObject'], Resource:['arn:aws:s3:::las-flores/*'] }] };
await client.send(new PutBucketPolicyCommand({ Bucket:'las-flores', Policy: JSON.stringify(policy) }));
console.log('bucket policy set: public read on las-flores');
