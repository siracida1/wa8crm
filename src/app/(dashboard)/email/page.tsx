'use client';

import { SendersManager } from '@/components/email/senders-manager';

// Email Marketing module (EMKT Zittex merge). Cuentas is the first
// vertical slice ported over — real DB-backed CRUD against the new
// `email_senders` table. Each function of the module gets its own
// route + sidebar item (see emailNavItems in sidebar.tsx), mirroring
// how the WhatsApp side does it, instead of tabs inside one page.
export default function EmailAccountsPage() {
  return <SendersManager />;
}
