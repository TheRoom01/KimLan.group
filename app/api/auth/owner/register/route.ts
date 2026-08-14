import { NextResponse } from "next/server";
import crypto from "crypto";

import {
  getRegistrationClientIp,
  hashRegistrationIdentifier,
} from "@/lib/owner/registrationSecurity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOwnerEmailFrom } from "@/lib/email/sender";


function normalizeOwnerPhone(
  phone: string,
) {
  const digits =
    phone.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.startsWith("00")) {
    return "+" + digits.slice(2);
  }

  if (digits.startsWith("0")) {
    return "+84" + digits.slice(1);
  }

  if (digits.startsWith("84")) {
    return "+84" + digits.slice(2);
  }

  return "+" + digits;
}


function hashCode(
  code: string,
) {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}


function generateCode() {
  return Math.floor(
    100000 +
      Math.random() * 900000,
  ).toString();
}

async function sendVerificationEmail(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getOwnerEmailFrom(),
      to: [email],
      subject: "Mã xác minh tài khoản Owner",
      text: `Mã xác minh tài khoản Owner của bạn là: ${code}. Mã có hiệu lực trong 10 phút.`,
      ...(process.env.OWNER_EMAIL_REPLY_TO
        ? { reply_to: process.env.OWNER_EMAIL_REPLY_TO }
        : {}),
      headers: {
        "X-Entity-Ref-ID": crypto.randomUUID(),
      },
      html: `
        <div style="font-family:Arial,sans-serif;color:#432918;line-height:1.6">
          <h2>Xác minh tài khoản Owner</h2>
          <p>Mã xác minh của bạn là:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
          <p>Mã có hiệu lực trong 10 phút. Không chia sẻ mã này với người khác.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Resend ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  }
}


export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json();


    const fullName =
      typeof body.fullName === "string"
        ? body.fullName.trim()
        : "";


    const phone =
      typeof body.phone === "string"
        ? body.phone
        : "";


    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";


    const password =
      typeof body.password === "string"
        ? body.password
        : "";


    const phoneNormalized =
      normalizeOwnerPhone(phone);


    if (
      !fullName ||
      !phoneNormalized ||
      !email ||
      password.length < 8
    ) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Thông tin đăng ký không hợp lệ",
        },
        {
          status:400,
        },
      );
    }


    const admin =
      createSupabaseAdminClient();

    const clientIp = getRegistrationClientIp(request);
    const emailHash = hashRegistrationIdentifier(email);
    const ipHash = hashRegistrationIdentifier(clientIp);
    const { data: rateLimit, error: rateLimitError } = await admin.rpc(
      "owner_registration_consume_send_v1",
      {
        p_email_hash: emailHash,
        p_ip_hash: ipHash,
      },
    );

    if (rateLimitError) {
      throw rateLimitError;
    }

    const limit = rateLimit as {
      allowed?: boolean;
      reason?: string;
      retry_after?: number;
    } | null;

    if (!limit?.allowed) {
      const retryAfter = Math.max(1, Number(limit?.retry_after || 60));
      return NextResponse.json(
        {
          ok: false,
          code:
            limit?.reason === "hourly_limit"
              ? "REGISTRATION_HOURLY_LIMIT"
              : "REGISTRATION_COOLDOWN",
          retryAfter,
          message:
            limit?.reason === "hourly_limit"
              ? "Bạn đã gửi tối đa 5 mã trong một giờ. Vui lòng thử lại sau."
              : `Vui lòng chờ ${retryAfter} giây trước khi gửi mã mới.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        },
      );
    }


    /*
      Kiểm tra số điện thoại đã tồn tại
    */

    const {
      data: phoneExists,
    } =
      await admin
        .from(
          "member_contact_phones",
        )
        .select(
          "id",
        )
        .eq(
          "phone_normalized",
          phoneNormalized,
        )
        .maybeSingle();


    if (phoneExists) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Số điện thoại đã được đăng ký",
        },
        {
          status:400,
        },
      );
    }


    /*
      Kiểm tra email Auth
    */

    const {
      data: users,
    } =
      await admin.auth.admin.listUsers();


    const existedEmail =
      users.users.some(
        (user) =>
          user.email?.toLowerCase() ===
          email,
      );


    if (existedEmail) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Email đã được sử dụng",
        },
        {
          status:400,
        },
      );
    }


    /*
      Tạo OTP email
    */

    const code =
      generateCode();


    /*
      TODO:
      Tích hợp email provider tại đây.
      Ví dụ:
      AUTH_EMAIL_OTP_WEBHOOK_URL
    */


    const expires =
      new Date(
        Date.now() + 10 * 60 * 1000,
      );


    const { error: verificationError } = await admin
      .from(
        "owner_registration_verifications",
      )
      .upsert(
        {
          email,
          phone_normalized:
            phoneNormalized,
          full_name:
            fullName,
          password_ciphertext:
            password,
          code_hash:
            hashCode(code),
          expires_at:
            expires.toISOString(),
        },
        {
          onConflict:
            "email",
        },
      );

    if (verificationError) {
      throw verificationError;
    }

    await sendVerificationEmail(email, code);


    return NextResponse.json({
      ok:true,
      message:
        "Mã xác minh đã được gửi tới hộp thư của bạn",
    });


  } catch(error) {

    console.error(
      "owner register error",
      error,
    );


    return NextResponse.json(
      {
        ok:false,
        message:
          "Không thể đăng ký",
      },
      {
        status:500,
      },
    );
  }
}
