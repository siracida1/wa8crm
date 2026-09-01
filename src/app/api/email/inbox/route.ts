import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

interface InboxRow {
  id: string
  sender_id: string
  thread_key: string
  from_email: string
  from_name: string | null
  to_email: string | null
  subject: string | null
  direction: 'inbound' | 'outbound'
  is_read: boolean
  received_at: string
}

// Lists conversation threads — grouped client-side (in this route) from
// the last 500 messages account-wide, since PostgREST has no DISTINCT
// ON. Fine for the volumes a small team's inbox sees; a future pass
// can paginate per-thread if that stops being true.
export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('email_inbox_messages')
      .select('id, sender_id, thread_key, from_email, from_name, to_email, subject, direction, is_read, received_at')
      .order('received_at', { ascending: false })
      .limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (data ?? []) as InboxRow[]
    const threads = new Map<
      string,
      { thread_key: string; sender_id: string; subject: string | null; counterpart: string; counterpart_name: string | null; last_message_at: string; unread_count: number }
    >()

    for (const row of rows) {
      const existing = threads.get(row.thread_key)
      if (!row.is_read && row.direction === 'inbound') {
        if (existing) existing.unread_count++
      }
      if (!existing) {
        threads.set(row.thread_key, {
          thread_key: row.thread_key,
          sender_id: row.sender_id,
          subject: row.subject,
          counterpart: row.direction === 'inbound' ? row.from_email : (row.to_email ?? row.from_email),
          counterpart_name: row.direction === 'inbound' ? row.from_name : null,
          last_message_at: row.received_at,
          unread_count: !row.is_read && row.direction === 'inbound' ? 1 : 0,
        })
      }
    }

    return NextResponse.json({ threads: Array.from(threads.values()) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
