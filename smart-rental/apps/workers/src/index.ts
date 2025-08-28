import { Worker } from 'bullmq';

const worker = new Worker('my-queue', async job => {
  console.log(job.data);
});

console.log('Worker started');
