import { withWorkflow } from 'workflow/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

// withWorkflow enables the Vercel Workflow SDK (durable campaign sending —
// see workflows/send-campaign.ts). No-op for normal routes.
export default withWorkflow(nextConfig);
