import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const supabaseAdmin =
  SUPABASE_URL && SERVICE_ROLE
    ? createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // DEBUG: xác nhận có service role không
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Missing SUPABASE_SERVICE_ROLE_KEY on server' },
        { status: 500 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            'Missing server env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local / Codespaces secrets.',
        },
        { status: 500 }
      )
    }

    const { id: roomId } = await params
    const body = await req.json()

    // payload chuẩn hoá: luôn gắn room_id theo URL param
    const payload = {
      ...body,
      room_id: roomId,
    }

    // ✅ Không dùng upsert(onConflict) vì DB của bạn đang thiếu UNIQUE(room_id)
    // Flow an toàn: UPDATE -> nếu chưa có thì INSERT -> nếu insert fail thì trả lỗi rõ
    const up = await supabaseAdmin
      .from('room_details')
      .update(payload)
      .eq('room_id', roomId)

    if (!up.error && (up.count ?? 0) > 0) {
      return NextResponse.json({ ok: true })
    }

    const ins = await supabaseAdmin.from('room_details').insert(payload)
    if (!ins.error) {
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json(
      {
        error: (ins.error as any)?.message ?? 'Insert failed',
        code: (ins.error as any)?.code ?? null,
        details: (ins.error as any)?.details ?? null,
        hint: (ins.error as any)?.hint ?? null,
      },
      { status: 500 }
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    )
  }
}
