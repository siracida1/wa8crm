'use client';

import { use } from 'react';
import { CampaignDetail } from '@/components/email/campaign-detail';

export default function EmailCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <CampaignDetail campaignId={id} />;
}
